const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';

const providerSchema = new mongoose.Schema({}, { strict: false });
const AdultUser = mongoose.model('AdultUser', providerSchema, 'adultusers');

async function geocode() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const providers = await AdultUser.find({
    role: 'provider',
    'providerProfile.location.city.name': { $exists: true },
    $or: [
      { 'providerProfile.location.coordinates': { $exists: false } },
      { 'providerProfile.location.coordinates.coordinates': { $size: 0 } },
      { 'providerProfile.location.coordinates.coordinates': [0, 0] }
    ]
  });

  console.log(`Found ${providers.length} providers needing geocoding`);

  for (const provider of providers) {
    const loc = provider.get('providerProfile.location');
    const city = loc.city?.name;
    const state = loc.state?.name;
    const country = loc.country?.name;

    if (!city) continue;

    console.log(`Geocoding ${city}, ${state || ''}, ${country || ''}...`);
    try {
      const queryStr = `${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json&limit=1`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'VibeApp/1.0' }
      });
      const data = await res.json();
      if (data[0]) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        await AdultUser.updateOne(
          { _id: provider._id },
          {
            $set: {
              'providerProfile.location.coordinates': {
                type: 'Point',
                coordinates: [lon, lat]
              },
              'providerProfile.location.city.lat': lat,
              'providerProfile.location.city.lng': lon
            }
          }
        );
        console.log(`Successfully geocoded ${city} to [${lon}, ${lat}]`);
      } else {
        console.log(`No results found for ${city}`);
      }
      // Sleep to respect Nominatim rate limits (1 req/sec)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Failed to geocode provider ${provider._id}:`, err);
    }
  }

  console.log('Geocoding migration complete.');
  await mongoose.disconnect();
}

geocode().catch(console.error);
