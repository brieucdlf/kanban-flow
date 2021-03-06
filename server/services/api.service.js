"use strict";


const DbService = require("moleculer-db");
const MongoAdapter = require("moleculer-db-adapter-mongo");
const JaegerService = require("moleculer-jaeger");

const ApiGateway = require("../modules/open-api");
const tasksDefinition = require("./resources/tasks.openapi.json")
const boardsDefinition = require("./resources/boards.openapi.json")
const usersDefinition = require("./resources/users.openapi.json")

module.exports = {
	name: "api-service",
	mixins: [ApiGateway],
	metrics: true,
	// More info about settings: https://moleculer.services/docs/0.13/moleculer-web.html
	settings: {
		dbProxy : DbService,
		adapter: () => new MongoAdapter(process.env.MONGO_URI),
		resources: [
			{
				definition: boardsDefinition,
				default: true,
				mixins: [],
			},
			{
				definition: tasksDefinition,
				default: true,
				mixins: [],
			},
			{
				definition: usersDefinition,
				default: true,
				mixins: [{
					actions: {
						"api.auth": {
							handler(ctx) {
								return "tata";
							}
						}
					}
				}],
				routes: [{
					path: "/authentificate",
					aliases: {
						"POST ": "Users.api.auth",
					}
				}]
			},
		],
	}
};
