FROM eclipse-temurin:23-jdk AS build

WORKDIR /workspace
COPY backend-java/ ./
RUN chmod +x gradlew \
    && ./gradlew --no-daemon bootJar -x test \
    && mkdir -p /out \
    && install -D "$(find build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar' -print -quit)" /out/app.jar

FROM eclipse-temurin:23-jre AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 skybook \
    && useradd --system --uid 10001 --gid skybook --home-dir /app skybook

WORKDIR /app
COPY --from=build --chown=10001:10001 /out/app.jar /app/app.jar

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]