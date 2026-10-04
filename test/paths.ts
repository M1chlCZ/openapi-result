/**
 * Synthetic `paths` fixture for tests and compile-time assertions.
 */
export interface Item {
  id: string;
  name: string;
  price_cents: number;
}

export type TestPaths = {
  "/v1/items": {
    get: {
      parameters: {
        query?: { page?: number; tag?: string | null; limit?: number };
      };
      responses: {
        200: {
          content: { "application/json": { items: Item[]; total: number } };
        };
        400: { content: { "application/problem+json": unknown } };
      };
    };
    post: {
      parameters: { header: { "x-api-key": string } };
      requestBody: {
        content: { "application/json": { name: string; price_cents: number } };
      };
      responses: {
        201: { content: { "application/json": Item } };
      };
    };
  };
  "/v1/items/{id}": {
    get: {
      parameters: { path: { id: string }; query?: { locale?: string } };
      responses: {
        200: { content: { "application/json": Item } };
        404: { content: { "application/problem+json": unknown } };
      };
    };
    patch: {
      parameters: { path: { id: string }; header?: { "if-match"?: string } };
      requestBody: {
        content: {
          "application/json": { name?: string; price_cents?: number };
        };
      };
      responses: {
        200: { content: { "application/json": Item } };
      };
    };
    delete: {
      parameters: { path: { id: string } };
      responses: { 204: unknown };
    };
  };
  "/v1/items/{id}/file": {
    get: {
      parameters: { path: { id: string } };
      responses: { 200: { content: { "application/octet-stream": unknown } } };
    };
    put: {
      parameters: { path: { id: string }; query: { reason: string } };
      requestBody: { content: { "application/octet-stream": unknown } };
      responses: { 200: { content: { "application/json": { size: number } } } };
    };
  };
  "/v1/health": {
    get: {
      responses: { 200: { content: { "application/json": { status: string } } } };
    };
    head: {
      responses: { 200: { content: { "application/json": { status: string } } } };
    };
  };
  "/v1/search": {
    get: {
      parameters: { query: { q: string; page?: number } };
      responses: { 200: { content: { "application/json": { items: Item[] } } } };
    };
  };
};
