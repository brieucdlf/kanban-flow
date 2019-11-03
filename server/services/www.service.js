"use strict";
const ApiGateway = require("moleculer-web");
const { ApolloService } = require("moleculer-apollo-server");
const ValidatorFactory = require("fastest-validator");
const validator = new ValidatorFactory();

const { InvalidRequestBodyError } = require("../modules/open-api/errors");

module.exports = {
	name: "www",
	hooks: {
		before: {
			"rest": ["beforeHooks"]
		}
	},
	methods: {
		beforeHooks(ctx) {
			console.log("BEFORE HOOK SERVEUR");
		}
	},
  mixins: [
		ApiGateway,
		ApolloService({
			// Global GraphQL typeDefs
			typeDefs: ``,
			// Global resolvers
			resolvers: {},
			// API Gateway route options
			routeOptions: {
				path: "/graphql",
				cors: true,
				mappingPolicy: "restrict",
				onBeforeCall(ctx, route, req, res) {
					ctx.meta.url = req.originalUrl;
					ctx.meta.method = req.method;
					ctx.meta.graphQL = true;
					ctx.meta.$span = {
						requestID: ctx.requestID,
						id: ctx._id,
            level: ctx.level,
					};
				}
			},
			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: true
			}
		})
	],
  settings: {
		routes: [{
    path: "/openapi",
    aliases: {
      "GET ": "www.openapi",
    }
  }]},
	actions:{
		openapi: {
			handler(){
				return this.openapi;
			}
		}
	},
  events: {
    "$services.changed"() {
      const services = this.broker.registry.getServiceList({ withActions: true });
      const restApiServices = services.filter((service) => service.settings.restApi && Object.keys(service.settings.restApi).length > 0)
      if (restApiServices.length > 0) {
        restApiServices.forEach((serviceRoutes) => {

          if (serviceRoutes.settings.restApi && serviceRoutes.settings.restApi.routes) {
						this.openapi = {
							...this.openapi,
							paths: Object.assign(this.openapi.paths,  serviceRoutes.settings.restApi.openapi.paths),
							components:{
								schemas: Object.assign(
									this.openapi.components.schemas,
									serviceRoutes.settings.restApi.openapi.components.schemas
								),
							}
						}
						const routeDef = serviceRoutes.settings.restApi.routes;
						// Create compile schema validators for all the Rest actions
						// Which name follows the format ServiceName.api.actionName
						let validators = {}
						if (serviceRoutes.actions) {
							validators = Object.values(serviceRoutes.actions)
							.filter((action) => {
								return /^[^.]+.api.[^.]+$/.test(action.name)
								&& action.inputSchema
								&& Object.keys(action.inputSchema).length > 0;
							})
							.reduce((acc, action) => {
								console.log("&&&&&&&&&&&&&&&", action.name);
								console.log(action.inputSchema);
								console.log("&&&&&&&&&&&&&&&");
								return {...acc, [action.name]: validator.compile(action.inputSchema)};
							}, {});
						}
						if (Array.isArray(routeDef)) {
							routeDef.forEach((routeItem) => {
								this.routes = this.routes.concat([this.createRoute({
									...routeItem,
									onBeforeCall(ctx, route, req, res) {
										console.log("BEFORECALL www");
										console.log(req.name);
										console.log("~~~~~~~é");
										const actionName = req.$action.name;
										if (validators[actionName]) {
											const isValidInput = validators[actionName](req.$params);
											if (Array.isArray(isValidInput)) {
												//Le format de l'input est invalide. On doit lever une erreur.
												throw new InvalidRequestBodyError(req.$params, isValidInput);
											}
										}
										const newParams = {...req.$params.params, ...req.$params.query, ...req.$params.body};
										console.log(req.$params);
										console.log("~~~~~~~é");
										console.log(newParams);
										// req.$params.query = {};
										req.$params = newParams
										console.log("BEFORECALL www");
										// Set request headers to context meta
										ctx.meta.$requestHeaders = req.headers;
										ctx.meta.url = req.originalUrl;
										ctx.meta.method = req.method;
									},
								})]);
							});
						}
						else {
							this.routes = this.routes.concat([this.createRoute({
								...routeDef,
								onBeforeCall(ctx, route, req, res) {
									console.log("CECI EST UN ON BEFORE CALL");
									// Set request headers to context meta
									ctx.meta.$requestHeaders = req.headers;
									ctx.meta.url = req.originalUrl;
									ctx.meta.method = req.method;
								},
							})]);
						}
          }
        });
      }
    },
  },
  created() {
    const services = this.broker.registry.getServiceList({ withActions: true });
		this.openapi = {
			"openapi": "3.0.0",
		  "info": {
		    "version": "1.0.0",
		    "title": "Kanban-flow",
		    "license": {
		      "name": "MIT"
		    }
		  },
		  "servers": [{
		    "url": "http://kanban-flow.io/"
		  }],
			paths: {},
			components: {
				schemas: {}
			}
		};
  }
}
