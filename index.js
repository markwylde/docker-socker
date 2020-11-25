const ndJsonFe = require('ndjson-fe');
const execa = require('execa');
const getPort = require('get-port');
const named = require('node-named');

const http = require('http');
const fs = require('fs').promises;

const httpRequest = require('./utils/httpRequest');

function createDnsServer (port) {
  const server = named.createServer();
  const ttl = 300;

  server.listen(port, '0.0.0.0', function () {
    console.log(`DNS server started on port ${port}`);
  });

  server.on('query', function (query) {
    const domain = query.name();
    console.log('DNS Query: %s', domain);
    const target = new named.ARecord('93.184.216.34', ttl);
    query.addAnswer(domain, target, ttl);
    server.send(query);
  });
}

async function watchDockerNetworks () {
  const feed = ndJsonFe();

  const request = http.request({
    timeout: 3000,
    socketPath: '/var/run/docker.sock',
    path: '/v1.26/events'
  }, function (response) {
    response.pipe(feed);

    feed.on('next', row => {
      console.log(row);
    });
  });

  request.end();
}

async function execute (app, command) {
  console.log('-----------------------');
  console.log('Executing: ', app, command);
  await execa(app, command.split(' ')).then(console.log).catch(console.log);
  console.log('-----------------------\n');
}

async function socksifyNetwork (networkId) {
  const data = await httpRequest({
    timeout: 3000,
    socketPath: '/var/run/docker.sock',
    path: `/v1.26/networks/${networkId}?verbose=true`
  });

  const network = JSON.parse(data.body);
  if (data.response.statusCode !== 200) {
    return;
  }

  const gateway = network.IPAM.Config[0].Gateway;
  const subnet = network.IPAM.Config[0].Subnet;
  console.log(JSON.stringify(network, null, 2));

  const tcpPort = await getPort();
  const udpPort = await getPort();

  const redsocksConfig = `
base {
  log_debug = on;
  log_info = on;
  log = "stderr";
  daemon = off;
  user = root;
  group = root;
  redirector = iptables;
}

redsocks {
  local_ip = 0.0.0.0;
  local_port = ${tcpPort};

  type = socks5;
  login = "${network.Options['socks-user']}";
  password = "${network.Options['socks-pass']}";
  ip = ${network.Options['socks-host']};
  port = ${network.Options['socks-port']};
}
`;

  const file = '/tmp/' + network.Id;
  await fs.writeFile(file, redsocksConfig);
  console.log('Wrote', file);

  const proc = execa('redsocks', ['-c', file]);
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);

  createDnsServer(udpPort);

  setTimeout(async () => {
    await execute('iptables', `-t nat -A DOCKERSOCKER -s 172.18.0.0/16 -p tcp -j DNAT --to-destination 172.18.0.1:${tcpPort}`);
    await execute('iptables', `-t nat -A DOCKERSOCKER -s 172.18.0.0/16 -p udp -j REDIRECT --to-ports ${udpPort}`);
  }, 1500);
}

async function createChain () {
  // await clearChain();
  await execute('iptables', '-t nat -N DOCKERSOCKER');
  await execute('iptables', '-t nat -A PREROUTING -p tcp -j DOCKERSOCKER');
  await execute('iptables', '-t nat -A PREROUTING -p udp -j DOCKERSOCKER');
  await execute('iptables', '-t nat -A DOCKERSOCKER -d 10.0.0.0/8 -j RETURN');
  await execute('iptables', '-t nat -A DOCKERSOCKER -d 127.0.0.0/8 -j RETURN');
  // await execute('iptables', '-t nat -A DOCKERSOCKER -d 172.16.0.0/12 -j RETURN');
  await execute('iptables', '-t nat -A DOCKERSOCKER -d 192.168.0.0/16 -j RETURN');
}

// async function clearChain () {
//   try {
//     await execa('iptables', ['-t', 'nat', '-F', 'DOCKERSOCKER']);
//     await execa('iptables', ['-t', 'nat', '-X', 'DOCKERSOCKER']);
//   } catch (error) {
//     console.log(error);
//   }
// }

// clearChain();
createChain();
socksifyNetwork('uzyn1ua2tu2amgew17k7lward');
