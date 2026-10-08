import { auth } from './src/config/auth';

async function test() {
  const signInResponse = await auth.api.signInEmail({
    body: { email: 'nonexistent@example.com', password: 'password' },
    asResponse: true,
  });

  const data = await signInResponse.json().catch(() => ({}));
  console.log(data);
}

test().catch(console.error);
