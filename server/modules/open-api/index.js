/*
 * moleculer
 * Copyright (c) TODO
 * LICENSE TODO
 */

"use strict";

const chalk                   = require("chalk");
const { match, deprecate }		= require("moleculer").Utils;
const _                       = require("lodash");
const bodyParser              = require("body-parser");
const ZSchema                 = require("z-schema");
const {
  MoleculerError,
  MoleculerServerError,
  ServiceNotFoundError
} = require("moleculer").Errors;
const prettyjson = require("prettyjson");
const {
	InvalidRequestBodyError,
	InvalidResponseTypeError,
	UnAuthorizedError,
	ForbiddenError,
	BadRequestError,
	NotFoundError,
	RateLimitExceeded,
	ServiceUnavailableError,
  ERR_ORIGIN_NOT_ALLOWED,
  EMPTY_REQUEST_BODY_NOT_ALLOWED,
} = require("./errors");

const MAPPING_POLICY_ALL		= "all";
const MAPPING_POLICY_RESTRICT	= "restrict";

const graphQlMixins = require("./graphqlMixins");

module.exports = {
  // Default name
  name: "api",
  mixins: [graphQlMixins],
  // Default settings
  settings: {
		// Log the request ctx.params (default to "debug" level)
		logRequestParams: "debug",
		// Log the response data (default to disable)
		logResponseData: null,
	},
  /**
  * Service created lifecycle event handler
  */
  created() {
    // TODO définir ici ce qu'on fait
		if (Array.isArray(this.settings.resources)) {
      const definitions = this.settings.resources.map(resource => {
        const schemas = resource.definition.components.schemas;
        const entityName = resource.definition.info.title;
        const version = resource.definition.info.version;
        const isDefault = resource.default || false;
        const modelCallbacks = resource.modelCallbacks;

        const dataModels = Object.keys(schemas)
          .map(key => this.createDataModel(key, schemas[key], null))
          .reduce((acc, model) => Object.assign(acc, model), {});
        const paths = resource.definition.paths;
        const {actions, entityHydrator} = Object.keys(paths)
          .map(key => this.createActions(entityName, paths[key], resource.definition.info, key))
          .reduce((acc, action) => {
            if (action.entityHydrator) {
              acc.entityHydrator = action.entityHydrator;
              delete action.entityHydrator;
            }
            return {
              ...acc,
              actions: Object.assign(acc.actions, action)
            }
          }, {
            actions: {},
            entityHydrator: null
          });
        actions["open-api"] = () => resource;
        if (entityHydrator) {
          dataModels.entityHydrator = entityHydrator;
        }
        const graphQlResolvers = this.createGraphQLResolvers(paths);
        const graphQlType = this.createGraphQLTypeDefinition(schemas, graphQlResolvers);
        const graphQlDef = {
          type: graphQlType.type,
          input: graphQlType.input,
        }
        if (graphQlType.entity.length > 0) {
          graphQlDef.resolvers = {[graphQlType.entity]: graphQlResolvers}
        }

        const basePath = this.minimalPath(Object.keys(paths))
        const routes = this.routesDefinition(entityName, paths, basePath, version);
        const newServiceDef = this.createService(
          entityName,
          version,
          actions,
          dataModels,
          schemas,
          routes,
          graphQlDef,
          isDefault,
          resource,
        );
        const newService = this.broker.createService(newServiceDef);
      	this.logger.info(`[OPEN-API] New Data-centric api for ${entityName}`);

        return newService;
      });
    }
  },
  methods: {
    createLinkBuilder(actionDefinition, pathAlias) {
      const operationId = actionDefinition.operationId;
      const parametersFn = (actionDefinition.parameters || [])
      .map((param) => {
        return {
          [param.name]: function (value) {
            return {[param.in]: { [param.name]: value  }}
          }
        };
      })
      .reduce((acc, fn) => Object.assign(acc, fn), {});

      return (parameters) => {
        const finalParams = Object.keys(parameters).
        map((key) => {
          if (parametersFn[key]) {
            return parametersFn[key](parameters[key]);
          }
          return {};
        })
        .reduce((acc, item) => {
          if(item.query) {
            acc.query.push(item.query);
          } else if(item.path) {
            acc.path.push(item.path);
          }
          return acc;
        }, {path: [], query: []});
        let finalPath = `${pathAlias}`;

        const path = finalParams.path.forEach((item) => {
          const key = Object.keys(item).shift();
          finalPath = finalPath.replace(`{${key}}`, item[key])
        })
        const query = finalParams.query.map((item) => {
          const key = Object.keys(item).shift();
          return `${key}=${item[key]}`;
        })
        return `${finalPath}${(query.length>0)?`?${query.join("&")}`:""}`
      }
    },
    createService(entityName, version, actions, dataModels, schemas, routes, graphql, isDefault, resource){
      const dbProxy = this.settings.dbProxy;
      const adapter = this.settings.adapter;
      const bodyRequestFormat = this.settings.bodyRequestFormat;
      const bodyResponseFormat = this.settings.bodyResponseFormat;
      const idField = this.settings.idField || 'id';
      const extention = this.settings.extention;
      const {settings, mixins, definition} = resource;
      mixins.push(dbProxy)
      return {
        name: entityName,
        version: version,
        extention,
        mixins,
        metrics: true,
        adapter: adapter(),
        collection: entityName,
        settings: {
          ...settings,
          graphql,
          $noVersionPrefix: isDefault,
          schemas,
          validator: new ZSchema({assumeAdditional: ["$ref"]}),
          idField,
          restApi: {
            routes,
            openapi: definition
          },
        },
        hooks: {
          before: {
            "api.create": ["beforeHook"],
            "api.create-urlMaker": ["beforeHook"],
            "api.update": ["beforeHook"],
            "api.update-urlMaker": ["beforeHook"],
            "api.read": ["beforeHook"],
            "api.read-urlMaker": ["beforeHook"],
            "api.search": ["beforeHook"],
            "api.search-urlMaker": ["beforeHook"],
            "api.delete": ["beforeHook"],
            "api.delete-urlMaker": ["beforeHook"],
          },
        },
        actions,
        methods: Object.assign({
          formatLinksHeaders(hydraterFn, broker, path, query, requestBody, responseBody, meta) {

            if (hydraterFn) {
              return Promise.resolve(hydraterFn(broker, path, query, requestBody, responseBody, meta)
              .then((linksResult) => {
                if (meta.hydrateDepth > 0 || !meta.isHttp) {
                  return {data : Object.assign(responseBody, linksResult)}
                }
                const links = this.createLinksHeader(linksResult);
                return {data : responseBody, headers: links};
              }))
            }
            return Promise.resolve({data: responseBody});
          },
          createLinksHeader(links) {
            return Object.keys(links)
            .reduce((acc, key) => `${acc}${(acc.length>0)?',':''}<${links[key]}>; rel="${key}"`, "");
          },
          beforeHook: function (ctx) {
            // console.log(Object.keys(ctx));
            ctx.meta.hydrateDepth = ctx.meta.hydrateDepth || 0;
            if (ctx.meta.$requestHeaders && ctx.meta.$requestHeaders['hydrate-depth']) {
              ctx.meta.hydrateDepth = parseInt(ctx.meta.$requestHeaders['hydrate-depth']);
            }
            ctx.meta.$span = {
              requestID: ctx.requestID,
              id: ctx._id,
              level: ctx.level,
            }
            ctx.meta.isGraphQl = (ctx.meta.graphQL) ? true : false;
            ctx.meta.isHttp = (ctx.meta.$requestHeaders) ? true : false;
            ctx.meta.$responseHeaders = {
              ["x-api-version"]: version,
            };
            if (!ctx.meta.isHttp && !ctx.params.body && ctx.params.input) {
              ctx.params.body = ctx.params.input;
            }
            if (!ctx.meta.isHttp && !ctx.params.params && ctx.params && Object.keys(ctx.params).length > 0) {
              ctx.params.params = ctx.params
            }
            // console.log("##########",entityName, ctx.parentID);
            // console.log("~~~~");
            // console.log(ctx.meta);
            // console.log("~~~~");
            // console.log(Object.keys(ctx).join(','));
            // console.log("##########");

          },
          bodyResponseFormat: (object) => {
            const output = Object.assign({}, object);
            // output.self = `/${entityName}/${object[idField]}${(extention)?`.${extention}`:''}`.toLowerCase();
            if (typeof bodyResponseFormat === "function") {
              return bodyResponseFormat(output);
            }
            return output;
          },
          bodyRequestFormat: (object) => {
            const output = Object.assign({}, object);
            if (typeof bodyRequestFormat === "function") {
              return bodyRequestFormat(output);
            }
            return output;
          },
          populateDefaultFromSchema: this.populateDefaultFromSchema,
        }, dataModels),
      }
    },
    routesDefinition(entityName, pathDictionary, basePath, version) {
      return Object.keys(pathDictionary).map(pathKey => {
        const path = pathDictionary[pathKey];
        const pathWithSlugs = pathKey.replace(/{([a-zA-Z0-9]+)}/g, (x) => `:${x.slice(1, -1)}`);
        const aliases = Object.keys(path)
          .map(method => this.addRoute(
            method,
            pathWithSlugs,
            basePath,
            entityName,
            path[method].operationId,
            version
          ))
          .reduce((acc, item) => Object.assign(acc, item), {})
        return aliases;
      })
      .reduce((acc, aliasBundle) => {
        return {
          ...acc,
          aliases: Object.assign(acc.aliases, aliasBundle)
        };
      }, {
        path: basePath,
        mappingPolicy: "restrict",
        mergeParams: false,
        bodyParsers: {
            json: true
        },
        aliases: {
          [`GET /open-api.json`]: `${entityName}.open-api`
        }
      })
      ;
    },
    addRoute(method, path, basePath, entity, operationId, version) {
      const operationType = operationId.replace(/([a-zA-Z0-9\\-_]+\.)+/, '');
      const versionPrefix = (version)?`${version}.`:"";
      const action = `${entity}.api.${operationType}`;
      return {[`${method.toUpperCase()} ${path.replace(basePath, '')}`]: action};
    },
    minimalPath(pathList) {
      return pathList.reduce((minPath, item) => {
        if (minPath === item.slice(0, minPath.length)) {
          return minPath;
        }

        let i = 0;
        let flag = true;
        while(i<minPath.length && flag) {
          if (minPath[i] === item[i]) {
            i++;
          }
          else {
            flag = false;
          }
        }
        return minPath.slice(0, i);
      }, pathList[0]);
    },
    createActions(entityName, pathDefinition, info, path) {
      let entityLinkHydrater = null;
      const pathActions = Object.keys(pathDefinition)
      .sort((method1, method2) => {
        const op1 = pathDefinition[method1].operationId;
        const op2 = pathDefinition[method2].operationId;
        const pattern = new RegExp("^([a-zA-Z0-9]+\.)+read$")
        if (pattern.test(op1)) { return -1; }
        else if (pattern.test(op2)) { return 1; }
        return 0;
      })
      .map(method => {
        const definition = pathDefinition[method];
        const responses = definition.responses;
        const successCode = Object.keys(definition.responses)[0];
        const successResponseType = this.getResponseDataType(responses);
        const actionName = definition.operationId.split(".").pop();
        const parametersFn = this.parseParameters(actionName, definition.parameters);
        const graphQlParams = this.createGraphQlParams(actionName, definition.parameters);
        const linkBuilder = this.createLinkBuilder(definition, path);
        const factory = this.matchMethodToAction(actionName);
        const linkHydrater = (definition.responses[successCode].links)?
          this.linkHydraterFactory(definition.responses[successCode].links):
          null;
        if (/^([a-zA-Z0-9]+\.)+read$/.test(definition.operationId) && !entityLinkHydrater) {
          entityLinkHydrater = linkHydrater;
        }
        const action = {};
        action[`api.${actionName}`] = factory(
          successResponseType,
          parametersFn,
          null,
          info,
          linkHydrater,
          {
            params: graphQlParams
          }
        );
        action[`api.${actionName}-urlMaker`] = {handler: function(ctx) {return linkBuilder(ctx.params)}};
        return action;
      })
      .reduce((acc, action) => Object.assign(acc, action), {});
      if (entityLinkHydrater) {
        pathActions['entityHydrator'] = entityLinkHydrater;
      }
      return pathActions;
    },
    populateDefaultFromSchema(entityName, schema){
      const defaultFn = {
        ["now()"]: () => new Date().toISOString(),
      }
      if (!schema.type || schema.type === "object") {
        const properties = schema.properties;
        if (properties) {
          // @TODO lancer les
          return Object.keys(properties)
          .map((key) => this.populateDefaultFromSchema(key, properties[key]))
          .reduce((acc, property) =>  Object.assign(acc, property), {})
        }
        return {};
      }
      else {
        if (schema.default) {
          if (defaultFn[schema.default]) {
            return { [entityName]: defaultFn[schema.default]() }
          }
          return { [entityName]: schema.default }
        }
      }
    },
    createDataModel(name, schema, modelCallbacks){
      const output = {}
      output[`#/components/schemas/${name}`] = function(data) {
        const v = this.settings.validator.validate(data, schema);
        if (v) {
          const defaultObject = this.populateDefaultFromSchema(name, schema);
          return Promise.all(Object.keys(schema.properties)
            .filter((key) => (schema.properties[key]['x-entity'])?true:false)
            .map((key) => {
              const args = schema.properties[key]['x-entity'].split(':');
              const service = args[0];
              const field = (args[1] === this.settings.idField)?"_id":args[1];
              const value = data[key];
              if ((args[1] === this.settings.idField)) {
                return this.broker.call(`${service}.get`, {id: value})
              }
              return this.broker.call(`${service}.find`, {query:{[field]: value}})
            })
          )
          .then((results) => {
            if (
              results
              .filter((item) => {
                if (item) {
                  if (Array.isArray(item)) {
                    return item.length > 0;
                  }
                  return true;
                }
                return false
              }).length === results.length
            ) {
              return Object.assign(defaultObject, data);
            }
            throw new InvalidRequestBodyError(data, "ERROR")
          }, (e) => {
            throw new InvalidRequestBodyError(data, e.stack)
          })
        }
        throw new InvalidRequestBodyError(data, this.settings.validator.getLastError())
      }
      output[`#/components/schemas/${name}/type`] = function() {return schema.type;}
      return output;
    },
    parseParameters(action, parametersSchema) {
      let reservedParams = [];
      switch(action) {
        case "search": reservedParams = ["page", "pageSize", "sort"]
      }
      if (parametersSchema && Array.isArray(parametersSchema)) {
        const fnList = parametersSchema
        .map((definition) => {
          const schema = definition.schema;
          const fn = function (data, ctx) {
            if(definition.schema.default) {
              data[definition.name] = definition.schema.default;
            }

            if (data[definition.name]) {
              let dataValue = data[definition.name];
              if (schema.type === "integer") {
                if (parseInt(dataValue) == dataValue) {
                  dataValue = parseInt(dataValue);
                }
              }
              const v = ctx.settings.validator.validate(dataValue, schema);
              if (v) {
                if (
                  reservedParams.includes(definition.name) ||
                  (definition.in === "path" && definition.name === ctx.settings.idField)
                ) {
                  return {
                    [definition.name]: dataValue,
                  }
                }
                else if (definition.name === ctx.settings.idField) {

                  dataValue = ctx.adapter.stringToObjectID(dataValue);
                  return { query: {_id: dataValue,}}
                }
                return { query: {
                  [definition.name]: dataValue,
                }}
              }
            }
            if (definition.required) {
              throw new BadRequestError("BAD_REQUEST", `Required parameter ${definition.name} not found`)
            }
          }
          return fn;
        })
        return function(params, ctx) {
          return Promise.all(fnList.map(fn => fn(params, ctx)))
          .then((results) => {
            const output= results.reduce((acc, item) => {
              const query = {};
              if (acc.query) { Object.assign(query, acc.query)}
              if (item && item.query) { Object.assign(query, item.query)}
              return Object.assign(acc, item, {query})
            }, {});
            return output;
          }, (err) => {
            return err;
          })
        };
      }
      return () => Promise.resolve({});
    },
    matchMethodToAction(actionName) {
      switch (actionName){
        case "create": return this.generateCreateAction;
        case "search": return this.generateListAction;
        case "read": return this.generateReadAction;
        case "update": return this.generateUpdateAction;
        case "delete": return this.generateDeleteAction;
      }
    },
    getResponseDataType(responseObject) {
      const firstResponse = responseObject[Object.keys(responseObject)[0]];
      const responseSchema = firstResponse.content[Object.keys(firstResponse.content)[0]].schema;
      if (Object.keys(responseSchema)[0] === "$ref") {
        return responseSchema["$ref"]
      }
    },
    linkHydraterFactory(linksDefinition) {
      const getValueInsideObject = (seperateur, chemin, objet) => {
        const keyList = chemin.split(seperateur);
        let output = objet;
        keyList.forEach((key) => {
          if (!output[key]) {
            return null;
          }
          output = output[key];
        })

        return output
      }
      const mapFn = Object.keys(linksDefinition)
      .map((key) => {
        const definition = linksDefinition[key];
        return {
          action: definition.operationId,
          key,
          fn: function(path, query, requestBody, responseBody, hydrate=false) {
            return Object.keys(definition.parameters)
            .map((key) => {
              const valueFormat = definition.parameters[key];
              const matchParams = valueFormat.match(/\$(response|request)\.(body|headers|path|query)(?:\.|#\/)(.*)/);
              let value = null;
              if (matchParams[1] === "response") {
                return {
                  [key]: getValueInsideObject(".", matchParams[3], responseBody)
                }
              }
              else if (matchParams[1] === "request") {
                switch(matchParams[2]) {
                  case "header":
                    console.log("linkHydraterFactory.header", getValueInsideObject(".", matchParams[3], ""));
                    break;
                  case "path": break;
                  case "body":
                    console.log("linkHydraterFactory.body", getValueInsideObject(".", matchParams[3], requestBody));
                    break;
                  case "query": break;
                }
              }
              console.log("###linkHydraterFactory####");
              console.log(matchParams[1], matchParams[2], matchParams[3]);
              console.log("###linkHydraterFactory####");
              return {};
            })
            .reduce((acc, item) => Object.assign(acc, item), {});
          }
        }
      })
      return function(broker, path, query, requestBody, responseBody, {hydrateDepth, ...metas}, ctx = null) {
        if (metas.isGraphQl) {return Promise.resolve({});}
        return Promise.all(
          mapFn.map(function(item) {
            const params = item.fn(path, query, requestBody, responseBody, hydrateDepth);
            const action = `${item.action}${(hydrateDepth>0)?"":"-urlMaker"}`;
            const opts = {
              meta: {
                hydrateDepth: (hydrateDepth>0)?hydrateDepth-1:0,
              },
              parentCtx: metas.$span,
            };
            return broker.call(`${action}`, params, opts)
            .then((result) => {
              return {[item.key]: result}
            })
          })
        )
        .then((resultsArray) => {
          return resultsArray.reduce((acc, item) => Object.assign(acc, item), {});
        });
      }
    },
    // List entities
    generateListAction(entityType, paramsFn, headers, info, pathLinkHydrater, graphQL) {
      const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
      const queryName = `list${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`
      return {
        graphql: {
          query: `${queryName}${graphQL.params}: [${entityName.slice(0, -1)}]`
        },
        handler(ctx) {
          return paramsFn(Object.assign({}, ctx.params, ctx.params.params, ctx.params.query), this)
          .then((params) => {
            return ctx.broker.call(`${ctx.service.name}.list`, params, {parentCtx:ctx.meta.$span});
          })
          .then((dataList) => {
            return Promise.all(dataList.rows.map((item) => {
              return this.formatLinksHeaders(this.entityHydrator, ctx.broker, "", "", ctx.params.body, item, ctx.meta)
              .then(({data, headers}) => {
                if (headers) {
                  ctx.meta.$responseHeaders = { ...headers };
                }
                return this.bodyResponseFormat(data)
              });
            }))
          })
          .then((dataList) => {
            return this.formatLinksHeaders(pathLinkHydrater, ctx.broker, "", "", ctx.params.body, dataList, ctx.meta)
            .then(({data, headers}) => {
              if (headers) {
                ctx.meta.$responseHeaders = { ...headers };
              }
              return data
            });
          })
          .then((data) => {
            return data;
          })
        }
      }
    },
    // Return one entity
    generateReadAction(entityType, paramsFn, headers, info, pathLinkHydrater, graphQL) {
      const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
      const queryName = `get${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`
      return {
        graphql: {
          query: `${queryName}${graphQL.params}: ${entityName}`
        },
        handler(ctx) {
          return paramsFn(Object.assign({}, ctx.params, ctx.params.params, ctx.params.query), this)
          .then((params) => ctx.broker.call(`${ctx.service.name}.get`, params, {parentCtx:ctx.meta.$span}))
          .then((results) => {
            return pathLinkHydrater(ctx.broker, "", "", ctx.params.body, results, ctx.meta, ctx)
            .then((linksResult) => {
              if (ctx.meta.hydrateDepth > 0 || !ctx.meta.isHttp || ctx.meta.isGraphQl) {
                return Object.assign(results, linksResult)
              }
              const links = this.createLinksHeader(linksResult);
              ctx.meta.$responseHeaders = {
                links,
              };
              return results;
            })

          })
          .then((result) => this.bodyResponseFormat(result), err => {throw err});
        }
      }
    },
    // Create one entity or an array
    generateCreateAction(entityType, parametersFn, headers, info, pathLinkHydrater, graphQL) {

      const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
      const queryName = `create${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`
      return {
        graphql: {
          mutation: `${queryName}(input: ${entityName}Create): ${entityName}`
        },
        handler(ctx) {
          // @TODO: gestion des params et des headers d'entrée
          try {
            if (!ctx.params.body) {
              throw new BadRequestError(EMPTY_REQUEST_BODY_NOT_ALLOWED, "Body Request can't be empty/undefined")
            }
            const validatedData = this[entityType](this.bodyRequestFormat(ctx.params.body));
            if (validatedData) {
              return this.actions.create(validatedData)
              .then((data) => {
                return this.bodyResponseFormat(data);
              })
            }
          }
          catch(err) {
            return err;
          }
        }
      }
    },
    // Update an entity
    generateUpdateAction(entityType, parametersFn, headers, info) {
          const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
          const queryName = `update${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`;
      return {
        graphql: {
          mutation: `${queryName}(input: ${entityName}Update): ${entityName}`
        },
        handler(ctx) {
          if (!ctx.params.body) {
            throw new BadRequestError(EMPTY_REQUEST_BODY_NOT_ALLOWED, "Body Request can't be empty/undefined")
          }
          return parametersFn(ctx.params.params, this)
          .then((params) => {
            const validatedData = this[entityType](this.bodyRequestFormat(ctx.params.body));
            if (validatedData) {
              return this.actions.update(Object.assign(params, validatedData));
            }
          });
        }
      }
    },
    // Delete an entity
    generateDeleteAction(entityType, parametersFn, headers, info) {
      const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
      const queryName = `delete${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`;
      return {
        graphql: {
          mutation: `${queryName}(id: String): ${entityName}`
        },
        handler(ctx) {
          return parametersFn(ctx.params.params, this)
          .then((params) => this.actions.remove(params))
          .then((result) => result, err => {throw err});

        }
      }
    }
  }
}
