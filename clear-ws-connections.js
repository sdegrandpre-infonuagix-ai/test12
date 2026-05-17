#!/usr/bin/env node
/**
 * clear-ws-connections.js
 *
 * Utility script to clear ALL websocket connection records from the DynamoDB table.
 * This is useful for resetting the system after troubleshooting or after a 409 conflict.
 *
 * Usage: `node clear-ws-connections.js`
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.WS_TABLE || 'test12-ws-connections';

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

async function clearAll() {
  console.log(`[clear-ws] Starting purge of table '${TABLE_NAME}'`);
  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;

  do {
    const scanResult = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'channelId, connectionId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const items = scanResult.Items || [];
    if (items.length === 0) break;

    // Delete each item (could batch but this is simple and safe)
    await Promise.allSettled(
      items.map(item =>
        ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { channelId: item.channelId, connectionId: item.connectionId },
        }))
      )
    );

    totalDeleted += items.length;
    console.log(`[clear-ws] Deleted ${items.length} items (total ${totalDeleted})`);
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`[clear-ws] Completed. Total records removed: ${totalDeleted}`);
}

clearAll().catch(err => {
  console.error('[clear-ws] Error during purge:', err);
  process.exit(1);
});
