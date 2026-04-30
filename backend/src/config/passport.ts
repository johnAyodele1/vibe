import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import User from '../models/User';
import { IUser } from '../types/models';

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        proxy: true,
      },
      async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          const { id, emails, displayName, name, photos } = profile;
          const email = emails && emails[0] ? emails[0].value : '';
          const firstName = name?.givenName || displayName.split(' ')[0] || 'User';
          const lastName = name?.familyName || displayName.split(' ').slice(1).join(' ') || '';
          const picture = photos && photos[0] ? photos[0].value : '';

          // Check if user already exists by googleId
          let user = await User.findOne({ googleId: id }) as IUser | null;

          if (!user) {
            // Check if user exists by email
            user = await User.findOne({ email }) as IUser | null;

            if (user) {
              user.googleId = id;
              await user.save();
            } else {
              // Create new user without auto-importing Google profile photos
              user = new User({
                email,
                googleId: id,
                firstName,
                lastName,
                photos: [],
              });
              await user.save();
            }
          }

          return done(null, user as Express.User);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as IUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
