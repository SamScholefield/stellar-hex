package com.stellarhex.model

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty

@JsonInclude(JsonInclude.Include.NON_NULL)
data class HexDataDto(
    val q: Int,
    val r: Int,
    @JsonProperty("object") val obj: StellarObjectDto? = null,
    val anomaly: String? = null,
    val tradeHub: Boolean? = null,
    val inNebula: Boolean? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class StellarObjectDto(
    val type: String,
    val subtype: String? = null,
    val size: Int,
    val resources: ResourcesDto? = null,
    val orbitAnchor: HexCoordDto? = null,
    val velocity: HexCoordDto? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ResourcesDto(
    val energy: Int? = null,
    val minerals: Int? = null,
    val alloys: Int? = null,
    val credits: Int? = null,
)

data class HexCoordDto(val q: Int, val r: Int, val s: Int = -q - r)

data class ChunkDataDto(
    val cx: Int,
    val cy: Int,
    val hexes: Map<String, HexDataDto>,
)

data class ChunkResponseDto(
    val chunks: List<ChunkDataDto>,
)
