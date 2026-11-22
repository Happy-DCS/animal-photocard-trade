import { prisma } from "../lib/prisma.js";

export function createImage({ uploaderId, imageUrl, category, score }) {
  return prisma.imageData.create({ data: { uploaderId, imageUrl, category, score } });
}

// card: 이 이미지로 이미 만든 카드가 있으면 { id } (이미지와 카드는 1:1)
export function findImageById(id) {
  return prisma.imageData.findUnique({
    where: { id },
    include: { card: { select: { id: true } } },
  });
}
