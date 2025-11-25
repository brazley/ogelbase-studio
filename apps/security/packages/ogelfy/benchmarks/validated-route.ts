import { Ogelfy } from '../src/index';

const app = new Ogelfy();

app.post('/user', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    }
  }
}, async (req, context) => {
  return { created: true, user: context.body };
});

await app.listen({ port: 3001 });
console.log('Validated route benchmark server ready on port 3001');
