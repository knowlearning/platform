cd ../sites/admin
pnpm update @knowlearning/patch-proxy

cd ../agents
pnpm update @knowlearning/patch-proxy

cd ../test
pnpm update @knowlearning/patch-proxy

cd ../embed
pnpm update @knowlearning/patch-proxy

cd ../sequence
pnpm update @knowlearning/patch-proxy
echo ""
echo "NOTICE: Don't forget to manually update explicit npm imports in ./core/source/utils.js"
echo "Press any key to continue."
read -r _
