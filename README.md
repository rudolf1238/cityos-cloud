# city-os-cloud

The server of the CityOS platform collaborated with the CHT.

## Introduction

The CityOS is using [NestJS](https://nestjs.com) which is a progressive Node.js framework for building efficient, reliable and scalable server-side applications. The main language using in this project is [TypeScript](https://www.typescriptlang.org) which combines elements of OOP (Object Oriented Programming), FP (Functional Programming), and FRP (Functional Reactive Programming). [GraphQL](https://graphql.org) is a query language used in the city-os-cloud for APIs and a runtime for fulfilling those queries with our existing data.

The CityOS provided the backend service for smart city solution including smart pole, smart energy and so on. It will fetch the data from the CHT(Chunghwa Telecom) [IOT platform](https://iot.cht.com.tw) to get the devices and data.

## Usage

### Setting Up the Environment

Create the `cityos_env` environment file, and you can use the example env file in `env/cityos_env`.

### mongoDB

The CityOS stores all data in the mongoDB, and you could spin the database locally or using the official website [mongoDB Atlas](https://www.mongodb.com) service.

### Redis

The CityOS needs the Redis server to perform the Pub/Sub mechanism, and you can reference the [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) for more detail. Simply spin a Redis in the docker server by

```shell
docker run --rm -p 6379:6379 redis:alpine
```

### Start the Server

#### Alternative I: start up the server on your environment

1. In the `node` directory, install all packages used in the project by `npm ci`.
2. Create the folder named `env` in the root directory as the same level of the `node` folder, and put the env file here with the name `cityos_env`.
3. Using ```npm start``` to start the server.

#### Alternative II: start up the server on docker

1. In the `docker/cityos-web` directory, copy all `node` directory to this folder by

   ```shell
   cp -r ../../node .
   ```

2. Run the following commend to create the docker image:

   ```shell
   docker build --no-cache -t ${IMAGE_NAME} .
   ```

3. Remove the `node` directory under `docker/cityos-web` by

   ```shell
   rm -rf ./node
   ```

4. When starting the docker container, remember to feed the correct environment file so that server will get the correct environment variables:

   ```shell
   docker run -p 4000:4000 --env-file=${cityos_env file} ${IMAGE_ID}
   ```

### Useful Commands

Because we choose the schema first approach to build the graphql API, it may be preferable to build a simple script to generate these on demand. Running the following commands will generate the latest `src/graphql.schema.ts` automatically.

```shell
npm run schema
```
