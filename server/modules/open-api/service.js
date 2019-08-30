
"use strict";

const Service = require("moleculer").Service;
const DataModel = require("./dataModel");

class ServiceDataCentric extends Service {
  constructor(broker, {definition}) {
    super(broker);
    this.schemas = {};
    this.definition = {
      name: (definition.info.title)?`test${definition.info.title}`:`newService-${Date.now()}`,
      version: definition.info.version,
      actions: {
        inputSan: {
          handler(ctx) {
            const dataModelName = ctx.params.dataModel;
            const data = ctx.params.data;
            return this[dataModelName](data);
          }
        }
      },
      methods: {
        beforeHook: this.beforeHook,
      },
      hooks: {
        before: {
          "api.create": ["beforeHook"],
          "api.update": ["beforeHook"],
          "api.read": ["beforeHook"],
          "api.read-urlMaker": ["beforeHook"],
          "api.search": ["beforeHook"],
          "api.search-urlMaker": ["beforeHook"],
          "api.delete": ["beforeHook"],
        },
      },
      settings: {
        restApi: {
          routes: [],
          openapi: definition,
        }
      },
    };
    this.processSchemas(definition.components.schemas)
  }

  /*******/
  beforeHook(ctx) {
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
  }
  /*******/

  addAction(name, fn) {
    this.definition.actions[name] = fn;
  }
  deleteAction(name) {
    if (this.definition.actions[name]) {
      delete this.definition.actions[name];
      return true;
    }
    return false;
  }

  addMethod(name, fn) {
    this.definition.methods[name] = fn;
  }
  deleteMethod(name) {
    if (this.definition.methods[name]) {
      delete this.definition.methods[name];
      return true;
    }
    return false;
  }

  getSchemaByPath(ref) {
    const schemaList = this.definition.settings.restApi.openapi.components.schemas;
    return ref.replace("#/components/schemas/", "").split('/')
    .reduce(
      (acc, pathKey) => {
        // if (schemaList[pathKey]) {
        //   return (schemaList[pathKey]);
        // }
        // return {};
        return (schemaList[pathKey]) ? schemaList[pathKey] : {};
      }
      , schemaList
    );
  }
  processSchemas(schemaList) {
    Object.keys(schemaList)
    .forEach((schemaKey) => {
      const schema = schemaList[schemaKey];
      if (schema.type === "object") {
        Object.keys(schema.properties)
        .forEach((propertyKey) => {
          const property = schema.properties[propertyKey];
          if (property.$ref) {
          }
        })
      }
      else if (schema.type === "array") {
        const items = schema.items;
        schema.items = (schema.items.$ref)
          ? this.getSchemaByPath(items.$ref)
          : schema.items;
      }
      this.addSchema(schemaKey, schema)
    })
  }
  addSchema(name, schema) {
    this.schemas[name] = new DataModel(schema);
    this.addMethod(
      `${name}SanitizeOutput`,
      (data) => this.schemas[name].sanitizeOutput(data)
    );
    this.addMethod(
      `${name}SanitizeInput`,
      (data) => this.schemas[name].sanitizeInput(data)
    );
  }
  deleteSchema(name) {
    if (this.schemas[name]) {
      delete this.schemas[name];
    }
  }
  getDataModel(name) {
    return this.schemas[name];
  }

  start() {
    this.parseServiceSchema(this.definition);
  }
  getDefintion() {
    return this.definition;
  }
}

module.exports = ServiceDataCentric;
