const ZSchema                 = require("z-schema");

class DataModel {
  constructor(schema) {
    this.schema = schema;
    this.inputSchema = Object.assign({}, this.generateIntermediateSchemas("input"));
    this.outputSchema = Object.assign({}, this.generateIntermediateSchemas("output"));
    this.generateIntermediateSchemas();
    this.validator = new ZSchema({assumeAdditional: ["$ref"]});
  }

  generateIntermediateSchemas(type="input") {
    const intermediateSchema = Object.assign({}, this.schema);
    console.log("~~~");
    console.log(intermediateSchema);
    console.log("~~~");
    Object.keys(intermediateSchema.properties)
    .forEach((key) => {
      const property = intermediateSchema.properties[key];
      if (property.readOnly && type === "output") {
        delete intermediateSchema.properties[key];
      }
      if (property.writeOnly && type === "input") {
        delete intermediateSchema.properties[key];
      }
    });
  }

  sanitizeInput(data) {
    const flag = this.validator.validate(data, this.inputSchema);
    console.log("////////////", flag);
    console.log(this.outputSchema);
    console.log("~~~");
    console.log(data);
    console.log("////////////");
    return data;
  }
  sanitizeOutput(data) {
    const flag = this.validator.validate(data, this.outputSchema);
    console.log("////////////", flag);
    console.log(this.outputSchema);
    console.log("~~~");
    console.log(data);
    console.log("////////////");
    return data;
  }

  formatString(str) {
    return `TUTU->${str}`;
  }
}

module.exports = DataModel;
