plugins {
    id("org.springframework.boot") version "3.4.3"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("jvm") version "2.1.10"
    kotlin("plugin.spring") version "2.1.10"
    kotlin("plugin.jpa") version "2.1.10"
}

group = "com.stellarhex"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring Boot
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // Kotlin
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testRuntimeOnly("com.h2database:h2")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

// ── Angular build integration ────────────────────────────────────

val angularDir = rootProject.projectDir.resolve("..")
val angularDist = angularDir.resolve("dist/stellar-hex/browser")
val staticDir = layout.buildDirectory.dir("resources/main/static")

tasks.register<Exec>("npmInstall") {
    workingDir = angularDir
    commandLine("npm", "ci")
    inputs.file(angularDir.resolve("package-lock.json"))
    outputs.dir(angularDir.resolve("node_modules"))
}

tasks.register<Exec>("buildAngular") {
    dependsOn("npmInstall")
    workingDir = angularDir
    commandLine("npm", "run", "build")
    inputs.dir(angularDir.resolve("src"))
    inputs.file(angularDir.resolve("angular.json"))
    inputs.file(angularDir.resolve("package.json"))
    outputs.dir(angularDist)
}

tasks.register<Copy>("copyAngular") {
    dependsOn("buildAngular")
    from(angularDist)
    into(staticDir)
}

tasks.named("processResources") {
    dependsOn("copyAngular")
}
