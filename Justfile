default:
    @just --list

# Install dependencies
install:
    npm install

# Compile to dist/
build: install
    npm run build

# Remove build output
clean:
    rm -rf dist

# Typecheck (there is no separate linter)
lint: install
    npm run typecheck

# Run unit tests
test: install
    npm test

# Build, then serve dist/ at http://127.0.0.1:8080
run: build
    npm start

# Build the container image
image:
    podman build -t lazymicrowave .

# Build the image, then serve it at http://127.0.0.1:8080
serve: image
    podman run --rm -p 8080:8080 lazymicrowave
