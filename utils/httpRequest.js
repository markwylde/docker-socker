const http = require('http');
const https = require('https');
const finalStream = require('final-stream');

function httpRequest (options) {
  return new Promise((resolve, reject) => {
    let agent;

    if (options.url) {
      const parsedUrl = new URL(options.url);
      agent = parsedUrl.protocol === 'https:' ? https : http;
    }

    agent = options.agent || agent || http;

    const requestOptions = options.url ? [options.url, options] : [options];
    const request = agent.request(...requestOptions, async function (response) {
      const body = await finalStream(response);

      resolve({ request, response, body });
    });

    request.on('error', reject);

    request.end(options.body);
  });
}

module.exports = httpRequest;
