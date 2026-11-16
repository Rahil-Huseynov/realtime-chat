FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm --workspace apps/web run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web
EXPOSE 3000
CMD ["npm","--workspace","apps/web","run","start"]
