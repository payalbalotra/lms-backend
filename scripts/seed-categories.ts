import 'dotenv/config';
import { db, closeDb } from '../src/db/client.js';
import { categories, subcategories } from '../src/db/schema.js';

const SYSTEM_USER_ID = 'HSXBV0T7Zl53wSr0ygxwoa4eOnTTnyEb'; // Super Admin User ID

async function seedCategories() {
  console.log('Seeding categories and subcategories...');

  const creatorId = SYSTEM_USER_ID;
  console.log(`Using User ID for creator: ${creatorId}`);

  console.log('Clearing old categories and subcategories...');
  await db.delete(subcategories);
  await db.delete(categories);

  // --- GENERAL CATEGORIES ---
  const generalData = [
    {
      nameEn: 'Onboarding',
      nameEs: 'Inducción',
      categoryType: 'general' as const,
      categoryIcon: 'user',
      subcats: ['Culture', 'Uniform', 'Employee Conduct'],
    },
    {
      nameEn: 'Food Safety',
      nameEs: 'Seguridad Alimentaria',
      categoryType: 'general' as const,
      categoryIcon: 'shield-check',
      subcats: [
        'Hygiene',
        'Cross-Contamination',
        'Labelling and Dating',
        'Allergy',
      ],
    },
    {
      nameEn: 'Cleaning',
      nameEs: 'Limpieza',
      categoryType: 'general' as const,
      categoryIcon: 'sparkles',
      subcats: ['Dishwashing', 'Chemical Handling', 'Waste Disposal'],
    },
  ];

  // --- STATION-BASED CATEGORIES ---
  const stationData = [
    {
      nameEn: 'Kitchen Operations',
      nameEs: 'Operaciones de Cocina',
      categoryType: 'station_based' as const,
      categoryIcon: 'pot',
      subcats: ['Station Setup', 'Kitchen Communication'],
    },
    {
      nameEn: 'Opening and Closing',
      nameEs: 'Apertura y Cierre',
      categoryType: 'station_based' as const,
      categoryIcon: 'door',
      subcats: [
        'Opening Procedures',
        'Closing Procedures',
        'End of Day Checks',
      ],
    },
    {
      nameEn: 'Equipment',
      nameEs: 'Equipo',
      categoryType: 'station_based' as const,
      categoryIcon: 'briefcase',
      subcats: ['Operation', 'Safety', 'Cleaning'],
    },
    {
      nameEn: 'Recipes',
      nameEs: 'Recetas',
      categoryType: 'station_based' as const,
      categoryIcon: 'book-open',
      subcats: ['Plating', 'Cooking', 'Portion Standards'],
    },
  ];

  const allData = [...generalData, ...stationData];

  for (const data of allData) {
    // 1. Insert Category
    const [insertedCategory] = await db
      .insert(categories)
      .values({
        nameEn: data.nameEn,
        nameEs: data.nameEs,
        categoryType: data.categoryType,
        categoryIcon: data.categoryIcon,
        createdBy: creatorId,
      })
      .returning();

    console.log(`Seeded category: ${data.nameEn}`);

    // 2. Insert Subcategories
    if (data.subcats.length > 0) {
      const subcatsToInsert = data.subcats.map((subName) => ({
        categoryId: insertedCategory.id,
        nameEn: subName,
        nameEs: `${subName} (es)`, // Placeholder for spanish translation
        createdBy: creatorId,
      }));

      await db.insert(subcategories).values(subcatsToInsert);
      console.log(`  -> Seeded ${data.subcats.length} subcategories`);
    }
  }

  console.log('Done seeding categories.');
}

// Run the script
seedCategories()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
