import { beforeAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.example') });
process.env.NODE_ENV = 'test';
