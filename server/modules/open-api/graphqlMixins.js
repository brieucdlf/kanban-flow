module.exports = {
  methods: {

    createGraphQLResolvers(pathList) {
      return Object.keys(pathList)
      .map((pathKey) => {
        const pathDef =   Object.keys(pathList[pathKey])
        .map((method) => pathList[pathKey][method])
        .filter((actionDef) => /^([a-zA-Z0-9]+\.)+read/.test(actionDef.operationId))
        .pop();
        if (pathDef) {
          const firstReponseSuccess = Object.keys(pathDef.responses)
          .filter((code) => parseInt(code) > 199 && parseInt(code) < 300)
          .shift();
          return pathDef.responses[firstReponseSuccess].links;
        }
        return false;
      })
      .filter((item) => (item)?true:false)
      .reduce((acc, links) => {
        return acc.concat(Object.keys(links)
          .map((key) => Object.assign({key: key}, links[key]))
        )
      }, [])
      .map((linkDef) => {
        const params = Object.keys(linkDef.parameters)
        .map((key) => {
          const paramValue = linkDef.parameters[key];
          let localParam = false;
          if (/^\$response\.body#\/[a-zA-Z0-9]+/.test(paramValue)) {
            localParam = paramValue.match(/^\$response\.body#\/([a-zA-Z0-9]+)/)[1];
          }
          if (localParam) {
            return {
              key:localParam,
              value: key,
              type: "rootParams",
            }
          }
          const scalarType = this.schemaTypesToGrahlQLType(paramValue);
          if (paramValue.length > 0 && scalarType && scalarType.length > 0) {
            return {
              key:scalarType,
              value: key,
              type: "params",
            }
          }
          return {};
        })
        .reduce((acc, item) => {
          const value = {[item.key]: item.value}
          return {
            ...acc,
            [item.type]: Object.assign(value, acc[item.type]),
          }
        }, {rootParams: {}, params: {}});
        return {
          [linkDef.key]: {
            action: linkDef.operationId,
            ...params,
          }
        }
      })
      .reduce((acc, item) => Object.assign(acc, item), {});
    },
    schemaTypesToGrahlQLType(type, schema) {
      switch(type) {
        case "string": return "String";
        case "integer": return "Int";
        case "array":
          let subStyle = "";
          if (schema.items.type) {
              return `[${this.schemaTypesToGrahlQLType(schema.items.type)}]`
          }
      }
    },
    createGraphQlParams(actionName, params){
      if (params && params.length > 0) {
        const paramsStr = params
        .map((item) => {
          return `${item.name}:${this.schemaTypesToGrahlQLType(item.schema.type, item.schema)}`;
        }).join(',')
        return `(${paramsStr})`;
      }
      return "()";
    },
    createGraphQLTypeDefinition(schemas, resolvers) {
      const firstKey = Object.keys(schemas)[0];
      const firstSchema = schemas[firstKey];
      const required = [].concat(schemas[firstKey].required);
      const idField = this.settings.idField || 'id';
      required.push(idField);
      const schemaTypesToGrahlQLType = (type, schema) => {
        switch(type) {
          case "string": return "String";
          case "integer": return "Int";
          case "array":
            let subStyle = "";
            if (schema.items.type) {
                return `[${schemaTypesToGrahlQLType(schema.items.type)}]`
            }
        }
      }
      if (firstSchema.type === 'object') {
        let readOnlyProps = "";
        const resolversProperties = Object.keys(resolvers)
        .map((key) => {
          const resolverDef = resolvers[key];
          const args = resolverDef.action.match(/([a-zA-Z0-9]+)\.(?:[a-zA-Z0-9]+\.)+([a-zA-Z0-9]+)/);
          const entityName = args[1].slice(0, -1);
          return (args[2] === "search")?`${key}: [${entityName}]`:`${key}: ${entityName}`
        }).reduce((acc, item) => `${(acc.length>0)?`${acc}\n`:""}${item}`, "");
        const lines = Object.keys(firstSchema.properties)
        .map((key) => {
          const property = firstSchema.properties[key];
          if (property.readOnly) {
            readOnlyProps += `${(readOnlyProps.length >0)?"|":""}${key}:`;
          }
          return `${key}: ${schemaTypesToGrahlQLType(property.type, property)}${(required.includes(key))?"!":""}`
        })
        const regExp = new RegExp(readOnlyProps);
        const inputLines = lines
        .filter((item) => !regExp.test(item))
        .reduce((acc, item) => `${(acc.length>0)?`${acc}\n`:""}${item}`, "");
        const typeLines = lines
        .reduce((acc, item) => `${(acc.length>0)?`${acc}\n`:""}${item}`, resolversProperties);

        return ({
          entity: firstKey,
          type: `
        """
        ${firstSchema.description || ""}
        """
        type ${firstKey} {
          ${typeLines}
        }
        `,
        input: `
        """
        ${firstSchema.description || ""}
        """
        input ${firstKey}Create {
          ${inputLines}
        }
        """
        ${firstSchema.description || ""}
        """
        input ${firstKey}Update {
          ${inputLines.replace(/!/g, "")}
        }
        `});
      }
      return { entity: "", type: "" };
    },
  }
}
