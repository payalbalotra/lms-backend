import 'dotenv/config';
import { db, closeDb } from '../src/db/client.js';
import { categories, subcategories } from '../src/db/index.js';

const SYSTEM_USER_ID = 'Fia2LLwNINbkqVCBAEidfZNNmkQpYMiC'; // Super Admin User ID

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
      subcats: [
        { en: 'Culture', es: 'Cultura' },
        { en: 'Uniform', es: 'Uniforme' },
        { en: 'Conduct', es: 'Conducta' },
      ],
    },
    {
      nameEn: 'Food Safety',
      nameEs: 'Seguridad Alimentaria',
      categoryType: 'general' as const,
      categoryIcon: 'shield-check',
      subcats: [
        { en: 'Hygiene', es: 'Higiene' },
        { en: 'Cross Contamination', es: 'Contaminación Cruzada' },
        { en: 'Labeling & Dating', es: 'Etiquetado y Fechado' },
        { en: 'Allergy', es: 'Alergias' },
      ],
    },
    {
      nameEn: 'Cleaning',
      nameEs: 'Limpieza',
      categoryType: 'general' as const,
      categoryIcon: 'sparkles',
      subcats: [
        { en: 'Dishwashing', es: 'Lavado de Platos' },
        { en: 'Chemical Handling', es: 'Manejo de Productos Químicos' },
        { en: 'Waste Disposal', es: 'Eliminación de Residuos' },
      ],
    },
  ];

  // --- STATION-BASED CATEGORIES ---
  const stationData = [
    {
      nameEn: 'Kitchen Operations',
      nameEs: 'Operaciones de Cocina',
      categoryType: 'station_based' as const,
      categoryIcon: 'pot',
      subcats: [
        { en: 'Station Setup', es: 'Configuración de Estación' },
        { en: 'Kitchen Communication', es: 'Comunicación en Cocina' },
      ],
    },
    {
      nameEn: 'Opening and Closing',
      nameEs: 'Apertura y Cierre',
      categoryType: 'station_based' as const,
      categoryIcon: 'door',
      subcats: [
        { en: 'Opening Procedures', es: 'Procedimientos de Apertura' },
        { en: 'Closing Procedures', es: 'Procedimientos de Cierre' },
        { en: 'End of Day Checks', es: 'Revisiones de Fin de Día' },
      ],
    },
    {
      nameEn: 'Equipment',
      nameEs: 'Equipo',
      categoryType: 'station_based' as const,
      categoryIcon: 'briefcase',
      subcats: [
        { en: 'Operation', es: 'Operación' },
        { en: 'Equipment Safety', es: 'Seguridad del Equipo' },
        { en: 'Equipment Cleaning', es: 'Limpieza del Equipo' },
      ],
    },
    {
      nameEn: 'Recipes',
      nameEs: 'Recetas',
      categoryType: 'station_based' as const,
      categoryIcon: 'book-open',
      subcats: [
        { en: 'Plating', es: 'Emplatado' },
        { en: 'Cooking', es: 'Cocción' },
        { en: 'Portion Standards', es: 'Estándares de Porciones' },
      ],
    },
  ];

  const allData = [...generalData, ...stationData];

  for (const data of allData) {
    // 1. Insert Category
    const [insertedCategory] = await db
      .insert(categories)
      .values({
        id: crypto.randomUUID(),
        nameEn: data.nameEn,
        nameEs: data.nameEs,
        categoryType: data.categoryType,
        categoryIcon: data.nameEn,
        createdBy: creatorId,
      })
      .returning();

    console.log(`Seeded category: ${data.nameEn}`);

    // 2. Insert Subcategories
    if (data.subcats.length > 0) {
      const subcatsToInsert = data.subcats.map((subcat) => ({
        id: crypto.randomUUID(),
        categoryId: insertedCategory.id,
        nameEn: subcat.en,
        nameEs: subcat.es,
        subcategoryIcon: subcat.en, // Use subcategory name for the icon
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
