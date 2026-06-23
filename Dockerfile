FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o anitr main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/anitr /app/anitr
EXPOSE 8080
CMD ["/app/anitr"]
