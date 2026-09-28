{{- define "plena-lms.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "plena-lms.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "plena-lms.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "plena-lms.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "plena-lms.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "plena-lms.selectorLabels" -}}
app.kubernetes.io/name: {{ include "plena-lms.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "plena-lms.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "plena-lms.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
