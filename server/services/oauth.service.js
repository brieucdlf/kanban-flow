"use strict";


const DbService = require("moleculer-db");
const MongoAdapter = require("moleculer-db-adapter-mongo");
const JaegerService = require("moleculer-jaeger");

const ApiGateway = require("../modules/open-api");
const tokensDefinition = require("./resources/tokens.openapi.json")

const AuthentificateService = require("./authentificate")


module.exports = {
  name: "oAuth",
  mixins: [ApiGateway],
  metrics: true,
  // More info about settings: https://moleculer.services/docs/0.13/moleculer-web.html
  settings: {
    bodyRequestFormat: (params) => {
      const now = new Date();
      now.setHours(now.getHours() + 2);
      return {
        ...params,
        accessToken: params.username + Date.now(),
        refreshToken: params.username + Date.now() * 2,
        expirate: now.toISOString()
      };
    },
    bodyResponseFormat: ({id, ...params}) => {
      return {...params}
    },
    dbProxy : DbService,
    adapter: () => new MongoAdapter(process.env.MONGO_URI),
    resources: [
      {
        definition: tokensDefinition,
        default: true,
        mixins: [AuthentificateService.mixins],
        routes: AuthentificateService.routes,
      },
    ],
  }
};
