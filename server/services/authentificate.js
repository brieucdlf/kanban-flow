const { MoleculerError } = require("moleculer").Errors;


module.exports = {
	mixins: {
		actions: {
			"api.validateToken": {
			params: {
				body: {
					type: "object",
					props: {
					}
				}
			}

			},
				handler(ctx) {
				const { body } = ctx.params;
				return ctx.broker.call("Tokens.find", {query: {username: body.username, accessToken: body.accessToken}})
					.then((tokens) => {
						if (tokens.length === 0) {
							throw new MoleculerError("Forbidden", 403, "NOT_FOUND");// ///change type to forbidden
						}
						//tokens.map((token) => {

					//	})
						let now = Date.now();
						let exp = new Date(tokens.expirate).getTime();
						if (exp - now <= 0) {
							throw new MoleculerError("Forbidden", 400, "NOT_FOUND");// ///change type to expired
						} else if (exp - now > 0) {
							console.log('not expired');
						}
					});
				}
		},
			"api.auth": {
				params: {
					body: {
						type: "object",
						props: {
							password: {
								type: "string",
							},
							username: {
								type: "string",
							}
						}
					}
				},
				handler(ctx) {
					const { body } = ctx.params;
					return ctx.broker.call("Users.find", {query: {username: body.username, password: body.password}})
						.then((users) => {
							if(users.length === 1) {
								return ctx.broker.call('Tokens.api.create', {body: {username: body.username}});
							}
							throw new MoleculerError("Auth Error", 404, "NOT_FOUND");
						});
				}
			}
		},
	routes: [{ 
		path: "/authentificate",
		mappingPolicy: "restrict",
		mergeParams: false,
		bodyParsers: {
			json: true,
		},
		aliases: {
			"POST ": "Tokens.api.auth",
		}
	}, {
		path: "/validateToken",
		mappingPolicy: "restrict",
		mergeParams: false,
		bodyParsers: {
			json: true,
		},
		aliases: {
			"POST ": "Tokens.api.validate",
		}
	}],
};
