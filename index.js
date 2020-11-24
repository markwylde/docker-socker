const ndJsonFe = require('ndjson-fe');
const execa = require('execa');
const getPort = require('get-port');

const http = require('http');
const fs = require('fs').promises;

const httpRequest = require('./utils/httpRequest');

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

async function socksifyNetwork (networkId) {
  const data = await httpRequest({
    timeout: 3000,
    socketPath: '/var/run/docker.sock',
    path: '/v1.26/networks/' + networkId
  });

  const network = JSON.parse(data.body);
  if (data.response.statusCode !== 200) {
    return;
  }

  const gateway = network.IPAM.Config[0].Gateway;
  const subnet = network.IPAM.Config[0].Subnet;

  const port = await getPort();

  const redsocksConfig = `
base {
  log_debug = off;
  log_info = on;
  log = "stderr";
  daemon = off;
  user = root;
  group = root;
  redirector = iptables;
}

redsocks {
  local_ip = 0.0.0.0;
  local_port = ${port};

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

  const proc = execa('/usr/sbin/redsocks', ['-c', file]);
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);

  await execa('iptables', `-t nat -A DOCKERSOCKER --source ${subnet} -p tcp -j REDIRECT --to-ports ${port}`.split(' '));
}

async function createChain () {
  await clearChain();
  await execa('iptables', '-t nat -N DOCKERSOCKER'.split(' ')).catch(console.log);
  await execa('iptables', '-t nat -A PREROUTING -p tcp -j DOCKERSOCKER'.split(' ')).catch(console.log);
  await Promise.all([
    execa('iptables', '-t nat -A DOCKERSOCKER -d 10.0.0.0/8 -j RETURN'.split(' ')),
    execa('iptables', '-t nat -A DOCKERSOCKER -d 127.0.0.0/8 -j RETURN'.split(' ')),
    execa('iptables', '-t nat -A DOCKERSOCKER -d 172.16.0.0/12 -j RETURN'.split(' ')),
    execa('iptables', '-t nat -A DOCKERSOCKER -d 192.168.0.0/16 -j RETURN'.split(' '))
  ]);
}

async function clearChain () {
  try {
    await execa('iptables', ['-t', 'nat', '-F', 'DOCKERSOCKER']);
    await execa('iptables', ['-t', 'nat', '-X', 'DOCKERSOCKER']);
  } catch (error) {
    console.log(error);
  }
}

clearChain();
// socksifyNetwork('ciw4y1fqnhk3g655p4m51ijcw');
