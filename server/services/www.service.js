"use strict";
const ApiGateway = require("moleculer-web");
const { ApolloService } = require("moleculer-apollo-server");

module.exports = {
	name: "www",
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
				mappingPolicy: "restrict"
			},
			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: true
			}
		})
	],
  settings: {
		routes: [{
    path: "/custom",
    aliases: {
      "GET "(req, res) {
          res.end('hello from custom handler')
      }
    }
  }]},
  events: {
    "$services.changed"() {
      const services = this.broker.registry.getServiceList({ withActions: true });
      const restApiServices = services.filter((service) => service.settings.restApi && Object.keys(service.settings.restApi).length > 0)
      if (restApiServices.length > 0) {
        restApiServices.forEach((serviceRoutes) => {
          if (serviceRoutes.settings.restApi.routes) {
						const routeDef = serviceRoutes.settings.restApi.routes;
            this.routes = this.routes.concat([this.createRoute({
							...routeDef,
			        onBeforeCall(ctx, route, req, res) {
			            // Set request headers to context meta
			          ctx.meta.$requestHeaders = req.headers;
			        },
						})])
          }
        });
      }
    },
  },
  created() {
    const services = this.broker.registry.getServiceList({ withActions: true });
  }
}
