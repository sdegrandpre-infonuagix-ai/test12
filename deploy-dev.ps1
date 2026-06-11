$APP_NAME    = "test12-dev"
$MCP_NAME    = "test12-mcp-dev"
$WS_NAME     = "test12-ws-dev"
$WS_API_NAME = "test12-ws-api-dev"
$DDB_TABLE   = "test12-ws-connections-dev"
$DDB_DATA    = "test12-data-dev"
$REGION      = "us-east-1"
$MEMORY_MB   = 512
$TIMEOUT_SEC = 30

$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)

Write-Host "`nTest12 DEV Deployment (Web UI + MCP + WebSocket)" -ForegroundColor Magenta
Write-Host "Account : $ACCOUNT_ID"
Write-Host "Region  : $REGION`n"

# ── Build env JSON (shared by all Lambdas) ──
$env_obj = @{ Variables = @{} }
Get-Content ".env" | Where-Object { $_ -match "^[A-Z_]+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $env_obj.Variables[$parts[0]] = $parts[1]
}
# Add DynamoDB env vars
$env_obj.Variables["WS_TABLE"] = $DDB_TABLE
$env_obj.Variables["DDB_DATA_TABLE"] = $DDB_DATA
$env_json = $env_obj | ConvertTo-Json -Compress -Depth 3
Set-Content -Path "$env:TEMP\test12-env.json" -Value $env_json -Encoding ASCII

# ── Helper: stage files into temp dir, zip, clean up ──
function Build-LambdaZip {
    param([string]$ZipName, [string[]]$Items)
    $stage = "$env:TEMP\test12-stage-$([System.IO.Path]::GetFileNameWithoutExtension($ZipName))"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item $stage -ItemType Directory -Force | Out-Null
    foreach ($item in $Items) {
        if (Test-Path $item -PathType Container) {
            robocopy $item "$stage\$item" /E /NFL /NDL /NJH /NJS /NP /MT:8 | Out-Null
        } else {
            Copy-Item $item $stage -Force
        }
    }
    if (Test-Path $ZipName) { Remove-Item $ZipName -Force }
    # Use .NET directly for reliable zipping
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, (Join-Path $PWD $ZipName))
    Remove-Item $stage -Recurse -Force
}

# ── 0. Build Tailwind CSS (fail fast — DEV deploy must not ship stale or missing CSS) ──
# Runs before the Step-1 bundling so public/dist/tailwind.css is included in bundle.zip's
# public/ tree. Story 0.8: requires npm dev deps to be installed (tailwindcss, postcss,
# autoprefixer); run `npm install` once locally if this step errors with "tailwindcss not found".
Write-Host "Step 0 - Building Tailwind CSS..." -ForegroundColor Yellow
npm run build:css
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'npm run build:css' failed (exit $LASTEXITCODE). Aborting deploy — DEV must not ship stale or missing CSS. Run 'npm install' first if tailwindcss is missing." -ForegroundColor Red
    exit 1
}
Write-Host "  Tailwind CSS built: public/dist/tailwind.css"

# ── 1. Package Web UI ZIP ──
Write-Host "Step 1/8 - Packaging Web UI ZIP..." -ForegroundColor Yellow
npm install --omit=dev 2>&1 | Out-Null
# logger.js + metrics.js: Epic 7 observability modules required by app.js — MUST
# be bundled or the Lambda crashes on require('./logger').
Build-LambdaZip "bundle.zip" @("app.js","lambda.js","db.js","logger.js","metrics.js","mcp-tools.js","ws-broadcast.js","package.json","node_modules","public")
Write-Host "  Web UI ZIP created."

# ── 2. Package MCP Server ZIP ──
Write-Host "`nStep 2/8 - Packaging MCP Server ZIP..." -ForegroundColor Yellow
Build-LambdaZip "mcp-bundle.zip" @("mcp-http.js","mcp-lambda.js","mcp-tools.js","db.js","package.json","node_modules")
Write-Host "  MCP ZIP created."

# ── 3. Package WebSocket Lambda ZIP ──
Write-Host "`nStep 3/8 - Packaging WebSocket Lambda ZIP..." -ForegroundColor Yellow
Build-LambdaZip "ws-bundle.zip" @("ws-handler.js","ws-broadcast.js","db.js","package.json","node_modules")
Write-Host "  WS ZIP created."

# ── Helper: deploy a Lambda function (reuses existing prod IAM role) ──
function Deploy-Lambda {
    param($FnName, $ZipFile, $Handler, $EnvFile)

    $ROLE_NAME = "test12-lambda-role"
    $ROLE_ARN = (aws iam get-role --role-name $ROLE_NAME --query Role.Arn --output text)

    $fnCheck = aws lambda get-function --function-name $FnName --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Creating Lambda with role $ROLE_NAME..." -ForegroundColor Gray

        aws lambda create-function `
            --function-name $FnName `
            --package-type Zip `
            --runtime nodejs20.x `
            --handler $Handler `
            --zip-file "fileb://$ZipFile" `
            --role $ROLE_ARN `
            --memory-size $MEMORY_MB `
            --timeout $TIMEOUT_SEC `
            --region $REGION `
            --environment "file://$EnvFile"
        if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Lambda create failed for $FnName." -ForegroundColor Red; exit 1 }
        Write-Host "  Lambda $FnName created."
    } else {
        aws lambda update-function-code --function-name $FnName --zip-file "fileb://$ZipFile" --region $REGION | Out-Null
        Write-Host "  Waiting for code update..." -ForegroundColor Gray
        aws lambda wait function-updated --function-name $FnName --region $REGION
        aws lambda update-function-configuration `
            --function-name $FnName `
            --memory-size $MEMORY_MB `
            --timeout $TIMEOUT_SEC `
            --handler $Handler `
            --environment "file://$EnvFile" `
            --region $REGION | Out-Null
        Write-Host "  Lambda $FnName updated."
    }
}

# ── Helper: ensure Function URL exists ──
function Ensure-FunctionUrl {
    param($FnName)

    $cors = '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"]}'
    Set-Content -Path "$env:TEMP\cors.json" -Value $cors -Encoding ASCII

    $urlCheck = aws lambda get-function-url-config --function-name $FnName --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        $FN_URL = (aws lambda create-function-url-config `
            --function-name $FnName `
            --auth-type NONE `
            --cors "file://$env:TEMP/cors.json" `
            --region $REGION `
            --query FunctionUrl --output text)

        aws lambda add-permission `
            --function-name $FnName `
            --statement-id AllowPublicAccess `
            --action lambda:InvokeFunctionUrl `
            --principal "*" `
            --function-url-auth-type NONE `
            --region $REGION | Out-Null
    } else {
        $FN_URL = (aws lambda get-function-url-config --function-name $FnName --region $REGION --query FunctionUrl --output text)
    }
    return $FN_URL
}

# ── 4. Ensure DynamoDB table (may need AWS Console if permissions missing) ──
Write-Host "`nStep 4/8 - Checking DynamoDB table ($DDB_TABLE)..." -ForegroundColor Yellow
$tableCheck = aws dynamodb describe-table --table-name $DDB_TABLE --region $REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    $createResult = aws dynamodb create-table `
        --table-name $DDB_TABLE `
        --attribute-definitions AttributeName=channelId,AttributeType=S AttributeName=connectionId,AttributeType=S `
        --key-schema AttributeName=channelId,KeyType=HASH AttributeName=connectionId,KeyType=RANGE `
        --billing-mode PAY_PER_REQUEST `
        --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Cannot create DynamoDB table (missing permissions)." -ForegroundColor Yellow
        Write-Host "  Please create table '$DDB_TABLE' manually in the AWS Console." -ForegroundColor Yellow
        Write-Host "  Partition key: channelId (String), Sort key: connectionId (String)" -ForegroundColor Gray
    } else {
        Write-Host "  DynamoDB table created. Waiting for active..."
        aws dynamodb wait table-exists --table-name $DDB_TABLE --region $REGION 2>&1 | Out-Null
        aws dynamodb update-time-to-live `
            --table-name $DDB_TABLE `
            --time-to-live-specification "Enabled=true,AttributeName=ttl" `
            --region $REGION 2>&1 | Out-Null
        Write-Host "  DynamoDB table ready."
    }
} else {
    Write-Host "  DynamoDB WS table already exists."
}

# ── 4b. Ensure DynamoDB data table ──
Write-Host "`nStep 4b/8 - Checking DynamoDB data table ($DDB_DATA)..." -ForegroundColor Yellow
$dataTableCheck = aws dynamodb describe-table --table-name $DDB_DATA --region $REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    $createData = aws dynamodb create-table `
        --table-name $DDB_DATA `
        --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S `
        --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE `
        --billing-mode PAY_PER_REQUEST `
        --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Cannot create DynamoDB data table." -ForegroundColor Yellow
        Write-Host "  Please create table '$DDB_DATA' manually: pk (String) + sk (String)" -ForegroundColor Gray
    } else {
        Write-Host "  DynamoDB data table created. Waiting for active..."
        aws dynamodb wait table-exists --table-name $DDB_DATA --region $REGION 2>&1 | Out-Null
        Write-Host "  DynamoDB data table ready."
    }
} else {
    Write-Host "  DynamoDB data table already exists."
}

# ── 5. Deploy Web UI Lambda ──
Write-Host "`nStep 5/8 - Deploying Web UI Lambda ($APP_NAME)..." -ForegroundColor Yellow
Deploy-Lambda -FnName $APP_NAME -ZipFile "bundle.zip" -Handler "lambda.handler" -EnvFile "$env:TEMP\test12-env.json"

# ── 6. Deploy MCP Server Lambda ──
Write-Host "`nStep 6/8 - Deploying MCP Server Lambda ($MCP_NAME)..." -ForegroundColor Yellow
Deploy-Lambda -FnName $MCP_NAME -ZipFile "mcp-bundle.zip" -Handler "mcp-lambda.handler" -EnvFile "$env:TEMP\test12-env.json"

# ── 7. Deploy WebSocket Lambda (reuses existing test12-lambda-role) ──
Write-Host "`nStep 7/8 - Deploying WebSocket Lambda ($WS_NAME)..." -ForegroundColor Yellow

$WS_ROLE_ARN = (aws iam get-role --role-name test12-lambda-role --query Role.Arn --output text)

# Build WS env
$ws_env_obj = $env_obj.Clone()
$ws_env_obj.Variables["WS_TABLE"] = $DDB_TABLE
$ws_env_json = $ws_env_obj | ConvertTo-Json -Compress -Depth 3
Set-Content -Path "$env:TEMP\test12-ws-env.json" -Value $ws_env_json -Encoding ASCII

# Check if Lambda exists
$fnCheck = aws lambda get-function --function-name $WS_NAME --region $REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating WS Lambda with existing role..." -ForegroundColor Gray
    aws lambda create-function `
        --function-name $WS_NAME `
        --package-type Zip `
        --runtime nodejs20.x `
        --handler "ws-handler.handler" `
        --zip-file "fileb://ws-bundle.zip" `
        --role $WS_ROLE_ARN `
        --memory-size $MEMORY_MB `
        --timeout $TIMEOUT_SEC `
        --region $REGION `
        --environment "file://$env:TEMP/test12-ws-env.json"
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: WS Lambda create failed." -ForegroundColor Red; exit 1 }
    Write-Host "  Lambda $WS_NAME created."
} else {
    aws lambda update-function-code --function-name $WS_NAME --zip-file "fileb://ws-bundle.zip" --region $REGION | Out-Null
    Write-Host "  Waiting for code update..." -ForegroundColor Gray
    aws lambda wait function-updated --function-name $WS_NAME --region $REGION
    aws lambda update-function-configuration `
        --function-name $WS_NAME `
        --memory-size $MEMORY_MB `
        --timeout $TIMEOUT_SEC `
        --handler "ws-handler.handler" `
        --environment "file://$env:TEMP/test12-ws-env.json" `
        --region $REGION | Out-Null
    Write-Host "  Lambda $WS_NAME updated."
}

# Note: DynamoDB + execute-api:ManageConnections permissions must be added
# to test12-lambda-role via AWS Console (see aws_setup_guide.md)

# ── 8. Create/update WebSocket API Gateway ──
Write-Host "`nStep 8/8 - Setting up WebSocket API Gateway..." -ForegroundColor Yellow

$WS_LAMBDA_ARN = (aws lambda get-function --function-name $WS_NAME --region $REGION --query Configuration.FunctionArn --output text)

# Check if API already exists
$existingApis = aws apigatewayv2 get-apis --region $REGION --query "Items[?Name=='$WS_API_NAME'].ApiId" --output text 2>&1
if ($existingApis -and $existingApis -ne "" -and $LASTEXITCODE -eq 0) {
    $WS_API_ID = $existingApis.Trim()
    Write-Host "  WebSocket API already exists: $WS_API_ID"
} else {
# Create WebSocket API
    $routeExpr = '$request.body.action'
    $WS_API_ID = (aws apigatewayv2 create-api `
        --name $WS_API_NAME `
        --protocol-type WEBSOCKET `
        --route-selection-expression $routeExpr `
        --region $REGION `
        --query ApiId --output text)
    Write-Host "  WebSocket API created: $WS_API_ID"
}

# Create/update integration
$integrationUri = "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${WS_LAMBDA_ARN}/invocations"

# Check for existing integration
$existingIntegrations = aws apigatewayv2 get-integrations --api-id $WS_API_ID --region $REGION --query "Items[0].IntegrationId" --output text 2>&1
if ($existingIntegrations -and $existingIntegrations -ne "None" -and $existingIntegrations -ne "" -and $LASTEXITCODE -eq 0) {
    $INTEGRATION_ID = $existingIntegrations.Trim()
    aws apigatewayv2 update-integration `
        --api-id $WS_API_ID `
        --integration-id $INTEGRATION_ID `
        --integration-type AWS_PROXY `
        --integration-uri $integrationUri `
        --region $REGION | Out-Null
    Write-Host "  Integration updated: $INTEGRATION_ID"
} else {
    $INTEGRATION_ID = (aws apigatewayv2 create-integration `
        --api-id $WS_API_ID `
        --integration-type AWS_PROXY `
        --integration-uri $integrationUri `
        --region $REGION `
        --query IntegrationId --output text)
    Write-Host "  Integration created: $INTEGRATION_ID"
}

$integrationTarget = "integrations/$INTEGRATION_ID"

# Create routes: $connect, $disconnect, $default, sendmessage
$routes = @('$connect', '$disconnect', '$default', 'sendmessage')
foreach ($route in $routes) {
    $existingRoute = aws apigatewayv2 get-routes --api-id $WS_API_ID --region $REGION --query "Items[?RouteKey=='$route'].RouteId" --output text 2>&1
    if ($existingRoute -and $existingRoute -ne "None" -and $existingRoute -ne "" -and $LASTEXITCODE -eq 0) {
        Write-Host "  Route $route already exists."
    } else {
        aws apigatewayv2 create-route `
            --api-id $WS_API_ID `
            --route-key $route `
            --target $integrationTarget `
            --region $REGION | Out-Null
        Write-Host "  Route $route created."
    }
}

# Grant API Gateway permission to invoke the Lambda
$sourceArn = "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${WS_API_ID}/*"
aws lambda add-permission `
    --function-name $WS_NAME `
    --statement-id "apigateway-ws-invoke" `
    --action lambda:InvokeFunction `
    --principal apigateway.amazonaws.com `
    --source-arn $sourceArn `
    --region $REGION 2>&1 | Out-Null

# Deploy stage "prod"
$existingStages = aws apigatewayv2 get-stages --api-id $WS_API_ID --region $REGION --query "Items[?StageName=='prod'].StageName" --output text 2>&1
if ($existingStages -and $existingStages -eq "prod") {
    # Create a new deployment to update the stage
    $DEPLOY_ID = (aws apigatewayv2 create-deployment --api-id $WS_API_ID --region $REGION --query DeploymentId --output text)
    aws apigatewayv2 update-stage `
        --api-id $WS_API_ID `
        --stage-name prod `
        --deployment-id $DEPLOY_ID `
        --region $REGION | Out-Null
    Write-Host "  Stage 'prod' redeployed."
} else {
    $DEPLOY_ID = (aws apigatewayv2 create-deployment --api-id $WS_API_ID --region $REGION --query DeploymentId --output text)
    aws apigatewayv2 create-stage `
        --api-id $WS_API_ID `
        --stage-name prod `
        --deployment-id $DEPLOY_ID `
        --region $REGION | Out-Null
    Write-Host "  Stage 'prod' created."
}

$WS_URL = "wss://${WS_API_ID}.execute-api.${REGION}.amazonaws.com/prod"
$WS_ENDPOINT = "https://${WS_API_ID}.execute-api.${REGION}.amazonaws.com/prod"
Write-Host "  WebSocket URL: $WS_URL" -ForegroundColor Cyan

# Update Lambda env vars with WS_ENDPOINT and WS_URL
Write-Host "`n  Updating Lambda env vars with WebSocket endpoint..."
$env_obj.Variables["WS_ENDPOINT"] = $WS_ENDPOINT
$env_obj.Variables["WS_URL"] = $WS_URL
$env_obj.Variables["WS_TABLE"] = $DDB_TABLE
$env_obj.Variables["DDB_DATA_TABLE"] = $DDB_DATA

# Get the Function URL for BASE_URL (needed by MCP shareable links)
$DEV_WEB_URL = (aws lambda get-function-url-config --function-name $APP_NAME --region $REGION --query FunctionUrl --output text 2>&1)
if ($DEV_WEB_URL -and $DEV_WEB_URL -match "^https://") {
    $env_obj.Variables["BASE_URL"] = $DEV_WEB_URL.TrimEnd('/')
}

$final_env_json = $env_obj | ConvertTo-Json -Compress -Depth 3
Set-Content -Path "$env:TEMP\test12-final-env.json" -Value $final_env_json -Encoding ASCII

# Update all three Lambdas with the final env (includes WS_ENDPOINT + WS_URL)
aws lambda wait function-updated --function-name $APP_NAME --region $REGION 2>&1 | Out-Null
aws lambda update-function-configuration --function-name $APP_NAME --environment "file://$env:TEMP/test12-final-env.json" --region $REGION | Out-Null
aws lambda wait function-updated --function-name $WS_NAME --region $REGION 2>&1 | Out-Null
aws lambda update-function-configuration --function-name $WS_NAME --environment "file://$env:TEMP/test12-final-env.json" --region $REGION | Out-Null
Write-Host "  Env vars updated on all Lambdas."

# ── Function URLs ──
Write-Host "`n  Setting up Function URLs..."
$WEB_URL = Ensure-FunctionUrl -FnName $APP_NAME
$MCP_URL = Ensure-FunctionUrl -FnName $MCP_NAME

Write-Host "`nDEV Deployment complete!" -ForegroundColor Green
Write-Host "Web UI (DEV) : $WEB_URL" -ForegroundColor Magenta
Write-Host "MCP endpoint : ${MCP_URL}mcp" -ForegroundColor Magenta
Write-Host "WebSocket    : $WS_URL" -ForegroundColor Magenta
Write-Host "Private      : ${WEB_URL}private" -ForegroundColor Magenta
Write-Host "Health check : ${MCP_URL}health`n"
