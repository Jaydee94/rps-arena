{{/* Chart name */}}
{{- define "rps-arena.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Fully qualified app name */}}
{{- define "rps-arena.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "rps-arena.redisName" -}}
{{- printf "%s-redis" (include "rps-arena.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "rps-arena.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "rps-arena.selectorLabels" -}}
app.kubernetes.io/name: {{ include "rps-arena.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "rps-arena.redisSelectorLabels" -}}
app.kubernetes.io/name: {{ include "rps-arena.name" . }}-redis
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* True ("true") when REDIS_URL is read from an existing Secret instead of being a plain value. */}}
{{- define "rps-arena.redisFromSecret" -}}
{{- if and (not .Values.redis.enabled) .Values.redis.existingSecret -}}true{{- end -}}
{{- end }}

{{/* REDIS_URL value: internal service, or the required external URL (not used with a Secret) */}}
{{- define "rps-arena.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ include "rps-arena.redisName" . }}:6379
{{- else -}}
{{- required "redis.externalUrl (or redis.existingSecret) is required when redis.enabled=false" .Values.redis.externalUrl -}}
{{- end -}}
{{- end }}
