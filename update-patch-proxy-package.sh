cd admin
pnpm update @knowlearning/patch-proxy

cd ../agents
pnpm update @knowlearning/patch-proxy

cd ../test
pnpm update @knowlearning/patch-proxy

cd ../tools/embed
pnpm update @knowlearning/patch-proxy

cd ../sequence
pnpm update @knowlearning/patch-proxy

echo "NOTICE: Don't forget to manually update the explicit import in ./core/source/utils.js"
