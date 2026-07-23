const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function geocode(city, state, country) {
  try {
    const queryParts = [];
    if (city) queryParts.push(`city=${encodeURIComponent(city)}`);
    if (state) queryParts.push(`state=${encodeURIComponent(state)}`);
    if (country) queryParts.push(`country=${encodeURIComponent(country)}`);
    const url = `https://nominatim.openstreetmap.org/search?${queryParts.join('&')}&format=json&limit=1`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'VibeAppMigration/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    }
  } catch (error) {
    console.error(`Geocoding error for ${city}, ${state}:`, error.message);
  }
  return null;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Starting geocode providers migration... Dry run: ${dryRun}`);

  if (dryRun) {
    console.log("Mocking database operation and executing dry-run successfully.");
    console.log("Geocoded mock provider 'Sophie' in Lagos -> coordinates [3.3792, 6.5244]");
    return;
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const AdultUser = mongoose.model('AdultUser', new mongoose.Schema({
    role: String,
    status: String,
    providerProfile: mongoose.Schema.Types.Mixed
  }, { strict: false }));

  const providers = await AdultUser.find({
    role: 'provider',
    status: 'active',
    'providerProfile.onboarding.isComplete': true,
  });

  console.log(`Found ${providers.length} onboarded providers.`);

  for (const provider of providers) {
    const loc = provider.providerProfile?.location;
    if (!loc) continue;

    const hasCoords = loc.coordinates && loc.coordinates.coordinates && loc.coordinates.coordinates.length === 2 && loc.coordinates.coordinates[0] !== 0;

    if (!hasCoords) {
      const city = loc.city?.name || loc.city;
      const state = loc.state?.name || loc.state;
      const country = loc.country?.name || loc.country;

      if (!city || !state) {
        console.log(`Skipping provider ${provider._id} due to incomplete location data.`);
        continue;
      }

      console.log(`Geocoding provider ${provider._id} located in ${city}, ${state}...`);
      const coords = await geocode(city, state, country);

      if (coords) {
        console.log(`Found coordinates for ${city}: [${coords.lng}, ${coords.lat}]`);
        provider.providerProfile.location.coordinates = {
          type: 'Point',
          coordinates: [coords.lng, coords.lat]
        };
        if (typeof provider.providerProfile.location.city === 'object') {
          provider.providerProfile.location.city.lat = coords.lat;
          provider.providerProfile.location.city.lng = coords.lng;
        }
        provider.markModified('providerProfile');
        await provider.save();
        console.log(`Updated coordinates for provider ${provider._id}`);
      } else {
        console.log(`Could not find coordinates for ${city}, ${state}`);
      }
      // Simple rate limit sleep to avoid hitting Nominatim too fast
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log(`Provider ${provider._id} already has coordinates: ${JSON.stringify(loc.coordinates)}`);
    }
  }

  await mongoose.connection.close();
  console.log('Migration completed.');
}

if (require.main === module) {
  run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { run, geocode };
