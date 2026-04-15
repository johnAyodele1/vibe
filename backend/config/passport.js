const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id, emails, displayName, name, photos } = profile;
        const email = emails[0].value;
        const firstName = name.givenName || displayName.split(" ")[0] || "User";
        const lastName = name.familyName || displayName.split(" ").slice(1).join(" ") || "";
        const picture = photos && photos[0] ? photos[0].value : "";

        // Check if user already exists by googleId
        let user = await User.findOne({ googleId: id });

        if (!user) {
          // Check if user exists by email
          user = await User.findOne({ email });

          if (user) {
            user.googleId = id;
            if (!user.photos || user.photos.length === 0) {
              user.photos = [{ url: picture, isMain: true }];
            }
            await user.save();
          } else {
            // Create new user
            user = new User({
              email,
              googleId: id,
              firstName,
              lastName,
              photos: picture ? [{ url: picture, isMain: true }] : [],
            });
            await user.save();
          }
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
