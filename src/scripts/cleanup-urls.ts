import prisma from '../config/db';

async function main() {
  console.log('🔍 Scanning for Images with localhost URLs...');
  
  const images = await prisma.image.findMany({
    where: {
      url: {
        contains: 'localhost'
      }
    }
  });

  console.log(`📌 Found ${images.length} images to clean.`);

  for (const img of images) {
    // Replace the full URL with just the relative path
    const relativePart = img.url.split('/uploads/')[1];
    if (relativePart) {
      const newUrl = `/uploads/${relativePart}`;
      await prisma.image.update({
        where: { id: img.id },
        data: { url: newUrl }
      });
      console.log(`✅ Cleaned: ${img.url} -> ${newUrl}`);
    }
  }

  console.log('✨ Database cleanup complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
