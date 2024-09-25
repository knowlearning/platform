# TODO: Run these before the rest of the script
# sudo apt update
# sudo apt install git
# git clone https://github.com/knowlearning/platform.git

apt install nodejs npm
npm install -g artillery@latest

git clone https://github.com/knowlearning/tests.git

# Add Docker's official GPG key:
apt-get install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update

# Install docker
apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Install kind
# TODO: check if intel or arm64 architecture and execute alt if intel: [ $(uname -m) = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-amd64
[ $(uname -m) = aarch64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-arm64
chmod +x ./kind
mv ./kind /usr/local/bin/kind

# For Linux ARMv8 (arm64)
# TODO: check if intel or arm64 architecture and execute alt if intel: curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64
curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-arm64 && \
install skaffold /usr/local/bin/

# install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl"
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# create stups for all the credential files
mkdir -p platform/core/infrastructure/development/.credentials && echo '{}' | tee platform/core/infrastructure/development/.credentials/AUTH_SERVICE_SECRET_KEY platform/core/infrastructure/development/.credentials/GOOGLE_OAUTH_CLIENT_CREDENTIALS platform/core/infrastructure/development/.credentials/MICROSOFT_OAUTH_CLIENT_CREDENTIALS platform/core/infrastructure/development/.credentials/CLASSLINK_OAUTH_CLIENT_CREDENTIALS > /dev/null
