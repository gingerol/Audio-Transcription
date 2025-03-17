# Swap Space Configuration

# To prevent Out of Memory (OOM) errors during transcription, we've added swap space to the server:

```bash
# Create a 4GB swap file
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Adjust swappiness (lower value means less aggressive swapping)
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

# This provides an additional 4GB of virtual memory as a buffer for memory-intensive operations.
