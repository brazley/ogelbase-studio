import { Ogelfy } from '../src/index';

const app = new Ogelfy();

app.get('/hello', async () => {
  return { hello: 'world' };
});

await app.listen({ port: 3000 });
console.log('Simple route benchmark server ready on port 3000');
