// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CrownHook, IThroneRegistry} from "./CrownHook.sol";

/// @notice Permissionless CREATE2 deployment. Mine salts off-chain for the required low 14 address bits.
contract CrownHookFactory {
    event HookDeployed(
        address indexed hook, address indexed registry, address indexed deployer, bytes32 salt
    );

    function deploy(IThroneRegistry registry, address deployer, bytes32 salt)
        external
        returns (CrownHook hook)
    {
        hook = new CrownHook{salt: salt}(registry, deployer);
        emit HookDeployed(address(hook), address(registry), deployer, salt);
    }

    function initCodeHash(IThroneRegistry registry, address deployer) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(CrownHook).creationCode, abi.encode(registry, deployer)));
    }

    function predict(IThroneRegistry registry, address deployer, bytes32 salt)
        external
        view
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash(registry, deployer))
                    )
                )
            )
        );
    }
}
