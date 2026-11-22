FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN go mod tidy && go test ./... && CGO_ENABLED=0 go build -o /notificaciones ./cmd/servidor

FROM alpine:3.20
WORKDIR /app
COPY --from=build /notificaciones /app/notificaciones
COPY db ./db
RUN adduser -D notif
USER notif
EXPOSE 8090
ENTRYPOINT ["/app/notificaciones"]
