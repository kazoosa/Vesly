import swaggerJSDoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "FinLink API",
      version: "0.1.0",
      description: "Mock Plaid-compatible financial aggregation API",
    },
    servers: [{ url: "http://localhost:3001", description: "Local" }],
    components: {
      securitySchemes: {
        DeveloperJwt: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        AccessToken: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error_type: { type: "string" },
            error_code: { type: "string" },
            error_message: { type: "string" },
            request_id: { type: "string" },
            environment: { type: "string" },
          },
        },
      },
    },
    tags: [
      { name: "Auth" },
      { name: "Applications" },
      { name: "Link" },
      { name: "Institutions" },
      { name: "Items" },
      { name: "Accounts" },
      { name: "Transactions" },
      { name: "Investments" },
      { name: "Identity" },
      { name: "Income" },
      { name: "Sandbox" },
    ],
  },
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
});
