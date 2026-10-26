// lambda.js - Handler de AWS Lambda (serverless-http) para API Gateway HTTP
const serverless = require('serverless-http');
const app = require('./index');
const Utils = require('./utils');

const handler = serverless(app);

exports.handler = async (event, context) => {
  Utils.log('info', `evento ${event.httpMethod || event.requestContext?.http?.method || 'cron'} ${event.rawPath || event.path || ''}`);
  return handler(event, context);
};