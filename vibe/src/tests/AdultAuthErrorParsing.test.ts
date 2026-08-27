import { describe, expect, it } from 'vitest';
import { extractErrorMessage } from '../contexts/AdultAuthContext';

describe('extractErrorMessage', () => {
  it('parses a string error response', () => {
    expect(extractErrorMessage({ error: 'Email is already registered' })).toBe('Email is already registered');
  });

  it('parses nested validation details', () => {
    expect(
      extractErrorMessage({
        error: {
          message: 'Validation failed',
          details: [
            { path: ['email'], message: 'Invalid email address' },
            { path: ['password'], message: 'Password is too short' },
          ],
        },
      }),
    ).toBe('Email: Invalid email address; Password: Password is too short');
  });

  it('parses field-keyed errors', () => {
    expect(
      extractErrorMessage({
        errors: {
          username: 'Username is already taken',
          dateOfBirth: ['You must be at least 18 years old'],
        },
      }),
    ).toBe('Username: Username is already taken; Date Of Birth: You must be at least 18 years old');
  });

  it('falls back to the API message', () => {
    expect(extractErrorMessage({ message: 'Unable to create account' })).toBe('Unable to create account');
  });
});
