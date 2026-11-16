FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install
COPY prisma ./prisma
COPY apps/api ./apps/api
RUN npx prisma generate --schema=prisma/schema.prisma && npm --workspace apps/api run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/api ./apps/api
EXPOSE 4000
CMD ["sh","-c","npx prisma db push --schema=prisma/schema.prisma && npm --workspace apps/api run start"]
