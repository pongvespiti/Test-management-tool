import { TestEnvironment } from 'jest-environment-jsdom';

/**
 * jsdom + the Fetch API of Node.js (jsdom has no `fetch`/`Response`). The API client under test
 * calls `fetch`, which tests stub with `jest.spyOn(globalThis, 'fetch')`.
 */
export default class JsdomWithFetchEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    const missing = {
      fetch,
      Request,
      Response,
      Headers,
      ReadableStream,
      TextEncoder,
      TextDecoder,
      structuredClone,
    };
    for (const [name, value] of Object.entries(missing)) {
      if (!(name in this.global)) this.global[name] = value;
    }
  }
}
