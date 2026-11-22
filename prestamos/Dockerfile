# Etapa 1: compilar y probar con Maven
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package

# Etapa 2: imagen ligera de ejecución
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/ms-prestamos.jar app.jar
RUN useradd -r prestamos
USER prestamos
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
