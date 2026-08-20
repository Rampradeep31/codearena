# ==============================================================================
# CodeArena Dockerfile — single-service build (frontend + backend)
# Production - Render Docker Deployment
#
# Build context is the REPO ROOT (see render.yaml: dockerContext: .), so this
# file can COPY from both backend/ and frontend/.
#
# Stage 1 builds the React SPA. Stage 2 builds the Spring Boot backend.
# Stage 3 is the runtime image, which serves the built frontend as static
# files (see FrontendController/SpaWebConfig) alongside the API routes —
# one deployed service, one origin, no CORS needed in production.
#
# The API container does NOT compile or run student code. Every submission is
# executed by the Docker judge (DockerExecutionService) in an isolated
# throwaway container, so no compilers are installed here.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: build the frontend
# ------------------------------------------------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
# Same-origin deployment: no VITE_API_URL means the frontend calls relative
# paths (/auth, /admin, /code, /student), which land on this same service.
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: build the backend
# ------------------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS backend-build
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
RUN mvn -B -q -DskipTests package

# ------------------------------------------------------------------------------
# Stage 3: backend runtime
# ------------------------------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

COPY --from=backend-build /build/target/codearena-backend-*.jar app.jar

# Copy the built frontend — FrontendDistLocator looks for this directory
# ("/app/frontend_dist") and serves it at "/", with API routes untouched.
COPY --from=frontend-build /frontend/dist ./frontend_dist

EXPOSE 8000

CMD ["sh","-c","java -jar app.jar --server.port=${PORT:-8000}"]
