import {createApp} from './app.js';

const server = createApp().listen(8080, '0.0.0.0');
process.once('SIGTERM', () => server.close());
