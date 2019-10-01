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
		resources: [
			{
				definition: boardsDefinition,
				default: true,
				mixins: [DbService],
				adapter: () => new MongoAdapter(process.env.MONGO_URI),
				bodyRequestFormat: (ctx) => {
					console.log("bodyRequestFormat~~~");
					console.log(ctx.params);
					console.log("~~~bodyRequestFormat");
				}
			},
			// {
			// 	definition: tasksDefinition,
			// 	default: true,
			// 	mixins: [],
			// },
			// {
			// 	definition: usersDefinition,
			// 	default: true,
			// 	mixins: [{
			// 		actions: {
			// 			"api.auth": {
			// 				handler(ctx) {
			// 					console.log("###");
			// 					console.log(ctx.params);
			// 					const query = {query: {username: ctx.params.username, password: ctx.params.password}};
			// 					console.log(query);
			// 					console.log("###");
			// 					return ctx.broker.call("Users.count", query)
			// 					.then((userCount) => {
			// 						if (userCount === 1) {
			// 							return "utilisateur existe";
			// 						}
			// 						return "User inexistant";
			// 					})
			// 				}
			// 			}
			// 		}
			// 	}],
			// 	routes: [{
			// 		path: "/authentificate",
			// 		mappingPolicy: "restrict",
	    //     bodyParsers: {
	    //         json: true
	    //     },
			// 		aliases: {
			// 			"POST ": "Users.api.auth",
			// 		}
			// 	}]
			// },
		],
	}
};
