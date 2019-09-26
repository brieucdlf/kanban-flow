class DataModel {
  constructor(name, schema, dataModels, schemaBuilders) {
    this.name = name;
    this.schema = Object.assign({key: name}, schema);
    this.dataModels = dataModels;
    this.middle = schemaBuilders
    this.setRequiredInsideProperties();
    this.resolve(name, this.schema);
  }

  setRequiredInsideProperties() {
    if (this.schema.required) {
      this.schema.required.forEach((key) => {
        this.schema.properties[key].required = true;
      });
    }
  }

  getSchemaBuilderByKey(key) {
    const foundSchemas = this.middle.filter((item) => key === item.key);
    if (foundSchemas.length > 0) {
      return foundSchemas[0].builder;
    }
    return {getRef: () => {}};
  }

  resolve(path, schemaDef, right="all") {
    let schema = schemaDef;
    let currentRight = right;
    if (schema.readOnly) {
      if (right === "all") {
        currentRight = "read";
      } else if (right === "write") {
        throw new Error();
      }
    }
    else if (schema.writeOnly) {
      if (right === "all") {
        currentRight = "write";
      } else if (right === "read") {
        throw new Error();
      }
    }
    //on vérifie si le schema n'est pas une référence locale
    if (schema.$ref) {
      const refName = schema.$ref.replace("#/components/schemas/", "");
      const refDataModel = this.dataModels[refName]
      this.middle.forEach(({key, regexp, builder}) => {
        if (regexp.test(currentRight)) {
          const ref = this.dataModels[refName].getSchemaBuilderByKey(key).getRef();
          builder.setRefProperty({...ref, key: schema.key}, path);
        }
      })
      return;
    }
    this.middle.forEach(({key, regexp, builder}) => {
      if (regexp.test(currentRight)) {
        builder.addProperty(schema, path)
      }
    })

    switch(schema.type) {
      case "object":
        Object.keys(schema.properties)
        .forEach((subKey) => {
            this.resolve(
              `${path}.properties.${subKey}`,
              Object.assign({key: subKey}, schema.properties[subKey]),
              currentRight
            );
        });
        break;
      case "array":
        this.resolve(`${path}.items`, Object.assign({key: "items"}, schema.items), currentRight);
        break;
    }
    return;
  }

}

module.exports = DataModel;
