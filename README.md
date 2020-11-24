# docker-socker
Create docker networks that forward all traffic to a socks proxy

## Installation
```bash
docker run --net host -dv /var/run/docker.sock:/var/run/docker.sock markwylde/docker-socker
```

## Usage
Create a new network, specifying the socks details as options
```bash
docker network create --driver overlay --opt socks-host=127.0.0.1 --opt socks-port=1080 --opt socks-user=test --opt socks-pass=test example
```

Create as many containers as your want, connecting to your new network

```bash
docker run -it --net example nginxdemos/hello
docker run -it --net example nginxdemos/hello
docker run -it --net example nginxdemos/hello
```
