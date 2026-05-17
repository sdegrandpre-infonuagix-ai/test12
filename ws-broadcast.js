'use strict';

/**
 * ws-broadcast.js — Shared WebSocket broadcast module
 * 
 * Uses DynamoDB to look up connections per channel,
 * then API Gateway Management API to push messages.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.WS_TABLE || 'test12-ws-connections';
const WS_ENDPOINT = process.env.WS_ENDPOINT || ''; // e.g. https://abc123.execute-api.us-east-1.amazonaws.com/prod

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Drop ALL WebSocket connections for a channel.
 * Forcefully closes each connection via the Management API,
 * then removes all entries from DynamoDB.
 *
 * @param {string} channelId
 * @param {object[]} connections - Array of { channelId, connectionId, ... } items
 * @param {ApiGatewayManagementApiClient} apigw
 */
async function dropAllConnections(channelId, connections, apigw) {
  console.warn(`[ws-broadcast] 409 conflict — dropping ALL ${connections.length} connections for channel ${channelId}`);

  await Promise.allSettled(
    connections.map(async (conn) => {
      // Force-close the WebSocket connection
      try {
        await apigw.send(new DeleteConnectionCommand({
          ConnectionId: conn.connectionId,
        }));
      } catch (err) {
        // 410 = already gone, that's fine
        if (err.$metadata?.httpStatusCode !== 410 && err.statusCode !== 410) {
          console.error(`[ws-broadcast] Failed to close connection ${conn.connectionId}:`, err.message);
        }
      }
      // Remove from DynamoDB
      try {
        await ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { channelId, connectionId: conn.connectionId },
        }));
      } catch (err) {
        console.error(`[ws-broadcast] Failed to delete DDB entry for ${conn.connectionId}:`, err.message);
      }
    })
  );
}

/**
 * Broadcast a message to all WebSocket connections in a channel.
 * Stale (410) connections are automatically cleaned up.
 * On 409 Conflict, ALL connections in the channel are dropped.
 *
 * @param {string} channelId 
 * @param {string} event - Event name (e.g. 'message', 'user_joined', 'user_left')
 * @param {object} data - Payload to send
 * @param {string} [endpoint] - Override WS_ENDPOINT
 */
async function broadcastToChannel(channelId, event, data, endpoint) {
  const wsEndpoint = endpoint || WS_ENDPOINT;
  if (!wsEndpoint) {
    console.warn('[ws-broadcast] No WS_ENDPOINT configured, skipping broadcast');
    return;
  }

  // Query all connections for this channel
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'channelId = :cid',
    ExpressionAttributeValues: { ':cid': channelId },
  }));

  const connections = result.Items || [];
  if (connections.length === 0) return;

  const apigw = new ApiGatewayManagementApiClient({
    region: REGION,
    endpoint: wsEndpoint,
  });

  const payload = JSON.stringify({ event, data });
  const stale = [];
  let got409 = false;

  await Promise.allSettled(
    connections.map(async (conn) => {
      try {
        await apigw.send(new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: payload,
        }));
      } catch (err) {
        const httpStatus = err.statusCode || err.$metadata?.httpStatusCode;
        if (httpStatus === 410) {
          // Connection is gone — clean it up
          stale.push(conn.connectionId);
        } else if (httpStatus === 409) {
          // Conflict — flag for full channel teardown
          got409 = true;
        } else {
          console.error(`[ws-broadcast] Error posting to ${conn.connectionId}:`, err.message);
        }
      }
    })
  );

  // 409 → drop ALL connections in the channel
  if (got409) {
    await dropAllConnections(channelId, connections, apigw);
    return; // skip individual stale cleanup, we already nuked everything
  }

  // Clean up stale connections
  await Promise.allSettled(
    stale.map((connectionId) =>
      ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { channelId, connectionId },
      }))
    )
  );
}

/**
 * Get the number of unique users connected to a channel.
 */
async function getChannelUserCount(channelId) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'channelId = :cid',
    ExpressionAttributeValues: { ':cid': channelId },
    ProjectionExpression: 'author',
  }));
  const authors = new Set((result.Items || []).map(i => i.author));
  return { count: authors.size, authors: [...authors] };
}

module.exports = { broadcastToChannel, getChannelUserCount, TABLE_NAME };
