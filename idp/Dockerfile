# syntax=docker/dockerfile:1.5

FROM golang:1.25 AS builder
WORKDIR /workspace

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /workspace/bin/idp ./cmd/idp

FROM gcr.io/distroless/base-debian12:latest
WORKDIR /app

COPY --from=builder /workspace/bin/idp /app/idp
COPY data /app/data

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/idp"]
