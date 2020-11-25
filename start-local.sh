(docker rm -f $(docker ps -aqf name="socker") || true)
docker build -t docker-socker .
docker run --net host --name socker -dit --privileged -v /var/run/docker.sock:/var/run/docker.sock docker-socker
sleep 0.1
docker logs -f $(docker ps -aqf name="socker")
